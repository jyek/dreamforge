import { database } from "./database";
import { runtime } from "./project-runtime";
export class TestCleanupError extends Error {
  constructor(
    message: string,
    readonly status = 409,
  ) {
    super(message);
  }
}
export function assertTestProject(
  project:
    | {
        owner_id: string;
        name: string;
        username: string;
        auth_email: string;
        e2e_run_id?: string;
      }
    | undefined,
  ownerId: string,
) {
  if (
    !project ||
    project.owner_id !== ownerId ||
    !/^E2E(?: |$)/i.test(project.name) ||
    !/^[a-f0-9-]{36}$/i.test(project.e2e_run_id || "") ||
    !/^e2e_[a-f0-9]{12}$/.test(project.username) ||
    !/@(?:tests|children)\.dreamforge\.invalid$/.test(project.auth_email)
  )
    throw new TestCleanupError("Test project not found.", 404);
}
const missing = (error: unknown) =>
  (error as { status?: number })?.status === 404;
/** Deliberately limited to disposable projects belonging to provisioned test accounts. */
export async function removeE2eProject(projectId: string, ownerId: string) {
  const db = await database().connect();
  let snapshotsDeleted = 0;
  try {
    await db.query("begin");
    const {
      rows: [project],
    } = await db.query(
      "select p.owner_id,p.metadata->>'name' as name,p.metadata->>'e2eRunId' as e2e_run_id,u.username,u.auth_email from adorable.projects p join adorable.profiles u on u.id=p.owner_id where p.vm_id=$1 for update of p",
      [projectId],
    );
    if (!project) {
      await db.query("commit");
      return { removed: false, snapshotsDeleted };
    }
    assertTestProject(project, ownerId);
    await db.query(
      "insert into adorable.project_execution(project_id) values($1) on conflict do nothing",
      [projectId],
    );
    const {
      rows: [execution],
    } = await db.query(
      "select active_run from adorable.project_execution where project_id=$1 for update",
      [projectId],
    );
    if (execution.active_run) {
      const {
        rows: [run],
      } = await db.query(
        "select deadline from adorable.execution_runs where id=$1",
        [execution.active_run],
      );
      if (!run || new Date(run.deadline).getTime() > Date.now())
        throw new TestCleanupError(
          "A test run is still active. Stop it before cleaning up.",
        );
      // Only expired disposable test runs can be reclaimed without a live worker.
      await db.query(
        "update adorable.execution_runs set cancel_requested=true,state='interrupted',finished_at=now() where id=$1",
        [execution.active_run],
      );
      await db.query(
        "update adorable.project_execution set active_run=null where project_id=$1",
        [projectId],
      );
    }
    const {
      rows: [binding],
    } = await db.query(
      "select sandbox_id from adorable.runtime_bindings where project_id=$1",
      [projectId],
    );
    for await (const snapshot of await runtime().snapshots.list({
      limit: 100,
    })) {
      const labels = (
        snapshot as unknown as { labels?: Record<string, string> }
      ).labels;
      if (snapshot.id === process.env.RUNTIME_BASE_SNAPSHOT) continue;
      if (
        labels?.projectId !== projectId &&
        (!binding || snapshot.sourceSandboxId !== binding.sandbox_id)
      )
        continue;
      try {
        await runtime().snapshots.delete(snapshot.id);
        snapshotsDeleted++;
      } catch (error) {
        if (!missing(error)) throw error;
      }
    }
    if (binding)
      try {
        await runtime().sandboxes.delete(binding.sandbox_id);
      } catch (error) {
        if (!missing(error)) throw error;
      }
    await db.query(
      "delete from adorable.runtime_bindings where project_id=$1",
      [projectId],
    );
    await db.query("delete from adorable.approved_shares where project_id=$1", [
      projectId,
    ]);
    await db.query(
      "delete from adorable.execution_events where run_id in(select id from adorable.execution_runs where project_id=$1)",
      [projectId],
    );
    await db.query("delete from adorable.execution_runs where project_id=$1", [
      projectId,
    ]);
    await db.query(
      "delete from adorable.project_execution where project_id=$1",
      [projectId],
    );
    // Keep the account's aggregate token usage; only disposable test-project records go.
    await db.query("delete from adorable.usage_runs where vm_id=$1", [
      projectId,
    ]);
    await db.query("delete from adorable.projects where vm_id=$1", [projectId]);
    await db.query("commit");
    return { removed: true, snapshotsDeleted };
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    db.release();
  }
}

/** Safety net when a test process is killed before its finally block can run. */
export async function removeStaleE2eProjects() {
  const { rows } = await database()
    .query(`select p.vm_id,p.owner_id from adorable.projects p
    join adorable.profiles u on u.id=p.owner_id
    where p.metadata->>'name' ~* '^E2E( |$)' and p.metadata->>'e2eRunId' ~* '^[a-f0-9-]{36}$' and u.username ~ '^e2e_[a-f0-9]{12}$'
    and (u.auth_email like '%@tests.dreamforge.invalid' or u.auth_email like '%@children.dreamforge.invalid')
    and p.updated_at<now()-interval '1 hour' order by p.updated_at limit 5`);
  let removed = 0;
  for (const project of rows) {
    try {
      if ((await removeE2eProject(project.vm_id, project.owner_id)).removed)
        removed++;
    } catch (error) {
      console.error("e2e.cleanup.failed", {
        projectId: project.vm_id,
        status: error instanceof TestCleanupError ? error.status : 503,
      });
    }
  }
  return removed;
}
