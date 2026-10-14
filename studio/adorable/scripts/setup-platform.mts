import { readFileSync, writeFileSync } from "node:fs";
import dotenv from "dotenv";
import { createHash, randomBytes } from "node:crypto";
import { database } from "../lib/database";
dotenv.config({ path: ".deployment/production.env", quiet: true });
const db = database();
try {
  const { rows } = await db.query(
    "select to_regclass('adorable.profiles') as existing",
  );
  if (!rows[0].existing) {
    const before = await db.query(
      "select vm_id,metadata from adorable.projects",
    );
    writeFileSync(
      ".deployment/platform-projects-before.json",
      JSON.stringify(before.rows),
      { mode: 0o600 },
    );
    await db.query(
      readFileSync(
        "supabase/migrations/202610140001_dreamforge_classrooms.sql",
        "utf8",
      ),
    );
  }
  const column = await db.query(
    "select 1 from information_schema.columns where table_schema='adorable' and table_name='usage_runs' and column_name='released_by'",
  );
  if (!column.rowCount)
    await db.query(
      readFileSync(
        "supabase/migrations/202610140002_uncertain_usage.sql",
        "utf8",
      ),
    );
  const roster = await db.query(
    "select to_regclass('adorable.teacher_builders') as existing",
  );
  if (!roster.rows[0].existing)
    await db.query(
      readFileSync(
        "supabase/migrations/202610140003_builder_roster.sql",
        "utf8",
      ),
    );
  if (process.argv.includes("--invite")) {
    const token = randomBytes(24).toString("base64url");
    await db.query(
      "insert into adorable.teacher_invites(token_hash) values($1)",
      [createHash("sha256").update(token).digest("hex")],
    );
    writeFileSync(
      ".deployment/initial-teacher-invite.json",
      JSON.stringify({ token, expires: "7 days" }),
      { mode: 0o600 },
    );
  }
  const summary = await db.query(
    "select count(*)::int as examples from adorable.projects where is_example",
  );
  console.log(
    "Classroom schema ready; separate examples:",
    summary.rows[0].examples,
  );
} finally {
  await db.end();
}
