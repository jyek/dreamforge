import { PROJECT_IDLE_SECONDS } from "./project-idle.mjs";
import { randomUUID } from "node:crypto";
import { database } from "./database";
import { beginRun, executionContext, finishRun, markEdit } from "./execution";
import { runtime, runtimeSandbox } from "./project-runtime";
import { prepareProjectRuntime } from "./prepare-project-runtime";
import { devVm, startDevServer } from "./project-vm";

export async function recoverSnapshot(
  projectId: string,
  runId: string,
  revision: number,
  signal: AbortSignal,
) {
  const db = await database().connect();
  let snapshot: string;
  try {
    await db.query("begin");
    const {
      rows: [state],
    } = await db.query(
      "select * from project_execution where project_id=$1 for update",
      [projectId],
    );
    const {
      rows: [target],
    } = await db.query(
      "select snapshot_id from execution_runs where id=$1 and project_id=$2",
      [runId, projectId],
    );
    if (!target?.snapshot_id) throw Error("Recovery snapshot is unavailable.");
    snapshot = target.snapshot_id;
    if (state?.active_run) {
      const { rowCount } = await db.query(
        "update execution_runs set state='interrupted',finished_at=now(),cancel_requested=true where id=$1 and deadline<now()",
        [state.active_run],
      );
      if (!rowCount)
        throw Error(
          "Stop the current run and wait for it to finish before recovering.",
        );
      await db.query(
        "update project_execution set active_run=null where project_id=$1",
        [projectId],
      );
      await db.query(
        "insert into execution_events(run_id,kind) values($1,'run.interrupted')",
        [state.active_run],
      );
    }
    await db.query("commit");
  } catch (e) {
    await db.query("rollback");
    throw e;
  } finally {
    db.release();
  }
  const run = await beginRun(projectId, randomUUID(), revision, signal);
  try {
    await executionContext.run(run, async () => {
      const previous = await runtimeSandbox(projectId);
      const restored = await runtime().sandboxes.create({
        snapshot: snapshot!,
        name: `recovery-${projectId}`,
        vcpu: 2,
        memoryMiB: 4096,
        diskMiB: 10240,
        idlePauseSeconds: PROJECT_IDLE_SECONDS,
        autoWake: true,
        network: { internet: true },
        labels: { application: "dreamforge", role: "dev", projectId },
      });
      // Kill the former runtime before changing the binding: an expired worker can never edit the recovered files.
      await previous.stop();
      await markEdit("[snapshot recovery]");
      await database().query(
        "update runtime_bindings set sandbox_id=$2,preview=null where project_id=$1",
        [projectId, restored.id],
      );
      await restored.previews.create(3000, {
        visibility: "private",
        ttlSeconds: 7 * 86400,
      });
      await prepareProjectRuntime(projectId);
      await startDevServer(devVm(projectId));
    });
    await finishRun(run, "completed");
    return { revision: run.revision };
  } catch (e) {
    await finishRun(run, "failed");
    throw e;
  }
}
