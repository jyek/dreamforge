import { config } from "dotenv";
import { database } from "../lib/database";
import { prepareProjectRuntime } from "../lib/prepare-project-runtime";
config({ path: ".env", quiet: true });
try {
  const { rows } = await database().query("select b.project_id from runtime_bindings b left join project_execution e on e.project_id=b.project_id where e.active_run is null order by b.project_id");
  if (!process.argv.includes("--apply")) console.log(`Found ${rows.length} idle project bindings. Run with --apply to enable developer tools and networking.`);
  else {
    for (const row of rows) {
      await prepareProjectRuntime(row.project_id);
      console.log(`Prepared ${row.project_id}`);
    }
  }
} finally { await database().end(); }
