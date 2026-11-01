import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import pg from "pg";
import dotenv from "dotenv";

// Deliberately no backup step: this migration was authorized without one.
// Dry-run by default. Credentials stay in memory and are never logged.
const envFile = process.argv
  .find((arg) => arg.startsWith("--env-file="))
  ?.slice(11);
if (!envFile) throw Error("Specify --env-file=/absolute/path/to/private.env");
const environment = dotenv.parse(fs.readFileSync(envFile));
const connection = new URL(environment.DATABASE_URL);
for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert", "options"])
  connection.searchParams.delete(key);
const migration = "202611010000_school_roles_and_groups";
const sql = fs.readFileSync(
  path.resolve("supabase/migrations", migration + ".sql"),
  "utf8",
);
const checksum = createHash("sha256").update(sql).digest("hex");
const db = new pg.Client({
  connectionString: connection.toString(),
  connectionTimeoutMillis: 10000,
  ssl: {
    rejectUnauthorized: true,
    ca: fs.readFileSync("config/supabase-ca.crt", "utf8"),
  },
});
try {
  await db.connect();
  await db.query("begin");
  await db.query("set local lock_timeout='5s'");
  await db.query("set local statement_timeout='60s'");
  await db.query("select pg_advisory_xact_lock(734119301)");
  const state = (
    await db.query(`select to_regclass('dreamforge.schools') as schools,
    to_regclass('dreamforge.school_admins') as school_admins,
    to_regclass('dreamforge.project_members') as project_members,
    to_regclass('dreamforge.migration_history') as history,
    exists(select 1 from information_schema.columns where table_schema='dreamforge' and table_name='prompt_reviews' and column_name='hold_status') as holds`)
  ).rows[0];
  if (state.history) {
    const applied = (
      await db.query(
        "select checksum from dreamforge.migration_history where version=$1",
        [migration],
      )
    ).rows[0];
    if (applied) {
      if (applied.checksum !== checksum)
        throw Error("Applied migration checksum differs; review manually.");
      console.log("Migration already applied with matching checksum.");
      await db.query("rollback");
      process.exitCode = 0;
    } else
      throw Error(
        "Existing migration history requires review before applying this consolidated migration.",
      );
  } else {
    if (
      state.schools ||
      state.school_admins ||
      state.project_members ||
      state.holds
    )
      throw Error(
        "A pending migration is already partly applied; stop for a schema review.",
      );
    const counts = async () =>
      (
        await db.query(`select
      (select count(*)::int from dreamforge.profiles) as profiles,
      (select count(*)::int from dreamforge.classes) as classrooms,
      (select count(*)::int from dreamforge.projects) as projects`)
      ).rows[0];
    const before = await counts();
    console.log("Preflight passed: all consolidated changes are pending.");
    if (!process.argv.includes("--apply")) {
      await db.query("rollback");
      console.log("Dry run only. Use --apply to migrate.");
    } else {
      await db.query(
        sql.replace(/^begin;\s*$/m, "").replace(/^commit;\s*$/m, ""),
      );
      const after = await counts();
      if (JSON.stringify(before) !== JSON.stringify(after))
        throw Error("Existing record counts changed unexpectedly.");
      // Verify that the previously crashing application queries now resolve.
      await db.query("select school_id from dreamforge.school_admins limit 0");
      await db.query(
        "select hold_status,held_prompt_used_at from dreamforge.prompt_reviews limit 0",
      );
      await db.query(
        "select group_class_id,editor_id from dreamforge.projects limit 0",
      );
      await db.query(
        "select profile_id,role,school_id from dreamforge.account_roles limit 0",
      );
      const roles = (
        await db.query(
          "select role,count(*)::int as grants from dreamforge.account_roles group by role order by role",
        )
      ).rows;
      await db.query(`create table dreamforge.migration_history(version text primary key,checksum text not null,applied_at timestamptz not null default now());
        alter table dreamforge.migration_history enable row level security;
        revoke all on dreamforge.migration_history from public,anon,authenticated;`);
      await db.query(
        "insert into dreamforge.migration_history(version,checksum) values($1,$2)",
        [migration, checksum],
      );
      await db.query("commit");
      console.log(
        JSON.stringify({
          migration,
          status: "applied",
          existingRecordCountsUnchanged: true,
          roleGrants: roles,
        }),
      );
    }
  }
} catch (error) {
  await db.query("rollback").catch(() => {});
  console.error(
    "Migration stopped; any uncommitted changes were rolled back.",
    {
      code: error.code || "validation",
      message: error.code ? "Database validation failed." : error.message,
    },
  );
  process.exitCode = 1;
} finally {
  await db.end();
}
