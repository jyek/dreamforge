import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { database } from "./database";
import { devVm } from "./project-vm";

export class ExecutionError extends Error {
  constructor(
    message: string,
    readonly status = 409,
  ) {
    super(message);
  }
}
export type Run = {
  id: string;
  projectId: string;
  revision: number;
  signal: AbortSignal;
  controller: AbortController;
  pending: Set<Promise<unknown>>;
  unsafeToUnlock?: boolean;
  snapshotReady?: Promise<void>;
  captureSnapshot?: () => Promise<string>;
};
export const executionContext = new AsyncLocalStorage<Run>();
export const currentRun = () => executionContext.getStore();
export async function event(run: Run, kind: string, data: unknown = {}) {
  await database().query(
    "insert into adorable.execution_events(run_id,kind,data) values($1,$2,$3)",
    [run.id, kind, JSON.stringify(data)],
  );
}
export async function beginRun(
  projectId: string,
  conversationId: string,
  revision: unknown,
  signal: AbortSignal,
  prepareSnapshot?: () => Promise<string>,
  deferSnapshot = false,
): Promise<Run> {
  const db = await database().connect();
  const id = randomUUID();
  let base: number;
  try {
    await db.query("begin");
    await db.query(
      "insert into adorable.project_execution(project_id) values($1) on conflict do nothing",
      [projectId],
    );
    const {
      rows: [state],
    } = await db.query(
      "select * from adorable.project_execution where project_id=$1 for update",
      [projectId],
    );
    // Expired workers keep their lock: a teacher must recover the snapshot before another edit.
    if (state.active_run)
      throw new ExecutionError(
        "A run is active or needs recovery. Stop it and recover before starting another.",
      );
    base = Number(state.revision);
    if (!Number.isSafeInteger(revision) || revision !== base)
      throw new ExecutionError(
        "Project changed. Reload its revision before sending again.",
      );
    await db.query(
      "insert into adorable.execution_runs(id,project_id,conversation_id,state,base_revision) values($1,$2,$3,'running',$4)",
      [id, projectId, conversationId, base],
    );
    await db.query(
      "update adorable.project_execution set active_run=$2 where project_id=$1",
      [projectId, id],
    );
    await db.query("commit");
  } catch (e) {
    await db.query("rollback");
    throw e;
  } finally {
    db.release();
  }
  const controller = new AbortController();
  const run: Run = {
    captureSnapshot: prepareSnapshot,
    id,
    projectId,
    revision: base!,
    pending: new Set<Promise<unknown>>(),
    signal: AbortSignal.any([
      signal,
      controller.signal,
      AbortSignal.timeout(240000),
    ]),
    controller,
  };
  try {
    await event(run, "run.started", { revision: base! });
    if (!deferSnapshot) await ensureRunSnapshot(run);
    return run;
  } catch (error) {
    await finishRun(run, "failed");
    throw error;
  }
}
/** Questions need no VM. Capture once, before the first tool that may change project files. */
export function ensureRunSnapshot(run = currentRun()): Promise<void> {
  if (!run)
    return Promise.reject(new ExecutionError("A managed run is required."));
  if (run.snapshotReady) return run.snapshotReady;
  const prepare = async () => {
    let stage = "runtime-preparation";
    try {
      await assertRun(run);
      await event(run, "snapshot.started");
      const snapshot = run.captureSnapshot
        ? { snapshotId: await run.captureSnapshot() }
        : await (async () => {
            const { runtimeSandbox } = await import("./project-runtime");
            const sandbox = await runtimeSandbox(run.projectId);
            if (sandbox.info.autoWake === false) {
              await sandbox.update({ autoWake: true });
              if (sandbox.state === "paused") await sandbox.wake();
            }
            const { prepareProjectRuntime } =
              await import("./prepare-project-runtime");
            await prepareProjectRuntime(run.projectId);
            await assertRun(run);
            stage = "snapshot";
            return devVm(run.projectId).snapshot({
              displayName: `Before run ${run.id}`,
            });
          })();
      await database().query(
        "update adorable.execution_runs set snapshot_id=$2 where id=$1",
        [run.id, snapshot.snapshotId],
      );
      await event(run, "snapshot.saved", { revision: run.revision });
      await assertRun(run);
    } catch (error) {
      await event(run, "run.error", {
        stage,
        code: (error as { code?: string }).code || "unavailable",
      }).catch(() => {});
      throw error;
    }
  };
  run.snapshotReady = prepare();
  run.pending.add(run.snapshotReady);
  void run.snapshotReady
    .finally(() => run.pending.delete(run.snapshotReady!))
    .catch(() => {});
  return run.snapshotReady;
}
export async function snapshotInProgress(projectId: string) {
  const { rows } = await database().query(
    "select 1 from adorable.project_execution p join adorable.execution_runs r on r.id=p.active_run where p.project_id=$1 and r.state='running' and r.snapshot_id is null and exists(select 1 from adorable.execution_events e where e.run_id=r.id and e.kind='snapshot.started')",
    [projectId],
  );
  return rows.length > 0;
}

/** Terminal input may change files; invalidate evidence before accepting it. */
export async function invalidateManualEdit(projectId: string) {
  await database().query(
    "insert into adorable.project_execution(project_id) values($1) on conflict do nothing",
    [projectId],
  );
  const { rowCount } = await database().query(
    "update adorable.project_execution set revision=revision+1,verification=null,updated_at=now() where project_id=$1 and active_run is null",
    [projectId],
  );
  if (!rowCount)
    throw new ExecutionError(
      "Wait for the active coding run to finish before using the terminal.",
    );
}
export async function assertRun(run = currentRun()) {
  if (!run) throw new ExecutionError("A managed run is required.");
  run.signal.throwIfAborted();
  const { rows } = await database().query(
    "select 1 from adorable.execution_runs r join adorable.project_execution p on p.active_run=r.id where r.id=$1 and r.state='running' and not r.cancel_requested and r.deadline>now()",
    [run.id],
  );
  if (!rows.length) {
    run.controller.abort();
    throw new ExecutionError("This run was stopped or expired.");
  }
  return run;
}
/** Invalidate BEFORE filesystem writes, including writes that later fail. */
export async function markEdit(file: string) {
  const run = await assertRun();
  await ensureRunSnapshot(run);
  const { rows } = await database().query(
    "update adorable.project_execution set revision=revision+1,verification=null,updated_at=now() where project_id=$1 and active_run=$2 and revision=$3 returning revision",
    [run.projectId, run.id, run.revision],
  );
  if (!rows.length) throw new ExecutionError("Revision conflict.");
  run.revision = Number(rows[0].revision);
  await event(run, "revision.changed", { revision: run.revision, file });
}
export async function finishRun(
  run: Run,
  state: "completed" | "failed" | "cancelled",
) {
  await Promise.allSettled([...run.pending]);
  const db = await database().connect();
  try {
    await db.query("begin");
    const { rows } = await db.query(
      "update adorable.execution_runs set state=case when cancel_requested and $2 <> 'interrupted' then 'cancelled' else $2 end,finished_at=now() where id=$1 and state='running' returning state",
      [run.id, run.unsafeToUnlock ? "interrupted" : state],
    );
    if (rows.length) {
      await db.query(
        "insert into adorable.execution_events(run_id,kind,data) values($1,$2,$3)",
        [
          run.id,
          `run.${rows[0].state}`,
          JSON.stringify({ revision: run.revision }),
        ],
      );
      if (!run.unsafeToUnlock)
        await db.query(
          "update adorable.project_execution set active_run=null where project_id=$1 and active_run=$2",
          [run.projectId, run.id],
        );
    }
    await db.query("commit");
  } catch (e) {
    await db.query("rollback");
    throw e;
  } finally {
    db.release();
  }
}
export async function executionState(projectId: string) {
  const {
    rows: [state],
  } = await database().query(
    "select revision,active_run,verification from adorable.project_execution where project_id=$1",
    [projectId],
  );
  const { rows: runs } = await database().query(
    "select id,state,base_revision,snapshot_id,deadline,cancel_requested from adorable.execution_runs where project_id=$1 order by created_at desc limit 10",
    [projectId],
  );
  const { rows: events } = await database().query(
    "select e.id,e.run_id,e.kind,e.data,e.created_at from adorable.execution_events e join adorable.execution_runs r on r.id=e.run_id where r.project_id=$1 order by e.id desc limit 100",
    [projectId],
  );
  return {
    revision: Number(state?.revision || 0),
    activeRun: state?.active_run || null,
    verification: state?.verification || null,
    runs,
    events: events.reverse(),
  };
}
