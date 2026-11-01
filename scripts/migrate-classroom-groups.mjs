import fs from "node:fs";
import pg from "pg";
import dotenv from "dotenv";
import { createHash } from "node:crypto";
const file = process.argv.find((a) => a.startsWith("--env-file="))?.slice(11);
if (!file) throw Error("Specify --env-file");
const env = dotenv.parse(fs.readFileSync(file));
const url = new URL(env.DATABASE_URL);
for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert", "options"])
  url.searchParams.delete(key);
const db = new pg.Client({
  connectionString: url.toString(),
  ssl: {
    rejectUnauthorized: true,
    ca: fs.readFileSync("config/supabase-ca.crt", "utf8"),
  },
});
const version =
  process.argv.find((a) => a.startsWith("--migration="))?.slice(12) ||
  "202611010001_classroom_groups";
if (
  ![
    "202611010001_classroom_groups",
    "202611010002_school_student_invites",
  ].includes(version)
)
  throw Error("Unsupported migration.");
const sql = fs.readFileSync(`supabase/migrations/${version}.sql`, "utf8");
const checksum = createHash("sha256").update(sql).digest("hex");
try {
  await db.connect();
  await db.query("begin");
  await db.query("set local lock_timeout='5s'");
  await db.query("select pg_advisory_xact_lock(734119301)");
  const found = await db.query(
    "select checksum from dreamforge.migration_history where version=$1",
    [version],
  );
  if (found.rowCount) {
    if (found.rows[0].checksum !== checksum)
      throw Error("Migration checksum differs");
    console.log("Migration already applied.");
    await db.query("rollback");
  } else if (!process.argv.includes("--apply")) {
    console.log(`Ready: ${version}.`);
    await db.query("rollback");
  } else {
    await db.query(sql.replace(/^begin;/, "").replace(/commit;\s*$/, ""));
    await db.query(
      "insert into dreamforge.migration_history(version,checksum) values($1,$2)",
      [version, checksum],
    );
    await db.query("commit");
    console.log(`${version} migration applied.`);
  }
} catch (e) {
  await db.query("rollback").catch(() => {});
  console.error("Migration failed:", e.code || e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
