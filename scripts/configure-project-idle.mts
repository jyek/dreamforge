/** Update existing project VM metadata without waking projects or touching files. */
import { config } from "dotenv";
import { database } from "../lib/database";
import { runtimeSandbox } from "../lib/project-runtime";
import { PROJECT_IDLE_SECONDS } from "../lib/project-idle.mjs";
config({ path: ".env", quiet: true });
try {
  const { rows } = await database().query(
    "select project_id from runtime_bindings order by project_id",
  );
  if (!process.argv.includes("--apply")) {
    console.log(
      `Found ${rows.length} project bindings. Run with --apply to set ${PROJECT_IDLE_SECONDS} idle seconds.`,
    );
  } else {
    for (const row of rows) {
      const sandbox = await runtimeSandbox(row.project_id);
      const before = sandbox.state;
      await sandbox.update({ idlePauseSeconds: PROJECT_IDLE_SECONDS });
      await sandbox.refresh();
      if (sandbox.info.idlePauseSeconds !== PROJECT_IDLE_SECONDS)
        throw Error(`Timeout update was not saved for ${row.project_id}`);
      console.log(
        JSON.stringify({
          projectId: row.project_id,
          idleSeconds: sandbox.info.idlePauseSeconds,
          before,
          after: sandbox.state,
        }),
      );
    }
    // Match the maintenance wake-up condition to the app's new idle threshold.
    // Keep its existing URL, Vault authentication and minute schedule intact.
    const { rows: jobs } = await database().query(
      "select jobid,command from cron.job where jobname in ('dreamforge-runtime-maintenance','adorable-runtime-maintenance')",
    );
    for (const job of jobs) {
      const command = job.command.replace(
        /last_activity < now\(\)-interval '(?:5 minutes|\d+ seconds)'/,
        `last_activity < now()-interval '${PROJECT_IDLE_SECONDS} seconds'`,
      );
      if (command !== job.command)
        await database().query("select cron.alter_job($1, command := $2)", [
          job.jobid,
          command,
        ]);
    }
    console.log(
      `Verified ${rows.length} project VMs; maintenance threshold aligned to ${PROJECT_IDLE_SECONDS} seconds.`,
    );
  }
} finally {
  await database().end();
}
