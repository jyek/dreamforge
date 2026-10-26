import { config } from "dotenv";
import { database } from "../lib/database";
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
config({ path: ".env", quiet: true });
const exec = promisify(execFile);
const apply = process.argv.includes("--apply");
const siteIndex = process.argv.indexOf("--site");
const site = new URL(
  siteIndex >= 0
    ? process.argv[siteIndex + 1]
    : "https://dreamforge2.vercel.app",
);
const db = database();
type Table = { schema: string; name: string; oid: number; rows: number };
async function audit(): Promise<Table[]> {
  const { rows } = await db.query<{
    schema: string;
    name: string;
    oid: number;
  }>(
    `select n.nspname as schema,c.relname as name,c.oid::integer as oid from pg_class c
     join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p')
     and n.nspname in ('adorable','dreamforge','public') order by 1,2`,
  );
  const tables: Table[] = [];
  for (const row of rows) {
    const identifier = (name: string) => '"' + name.replaceAll('"', '""') + '"';
    const {
      rows: [count],
    } = await db.query(
      `select count(*)::integer as n from ${identifier(row.schema)}.${identifier(row.name)}`,
    );
    tables.push({ ...row, rows: count.n });
  }
  return tables;
}
async function main() {
  const before = await audit();
  console.log(
    JSON.stringify({ mode: apply ? "apply" : "audit", tables: before }),
  );
  if (!apply) return;
  // A preview or old production must never trigger the live cutover accidentally.
  if (
    site.protocol !== "https:" ||
    site.username ||
    site.password ||
    site.pathname !== "/"
  )
    throw Error("Pass the canonical HTTPS production origin with --site");
  const page = await fetch(new URL("/login", site), {
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  if (
    !page.ok ||
    !(await page.text()).includes('data-database-schema="dreamforge"')
  )
    throw Error(
      "Deploy the schema-compatible application to production before applying this migration",
    );
  const backupDir = path.join(
    homedir(),
    "Documents",
    "DreamForge",
    "database-backups",
    new Date().toISOString().replaceAll(":", "-"),
  );
  await mkdir(backupDir, { recursive: true, mode: 0o700 });
  const backup = path.join(backupDir, "application-before.dump");
  const dump = process.env.PG_DUMP || "pg_dump";
  const restore =
    path.dirname(dump) === "."
      ? "pg_restore"
      : path.join(path.dirname(dump), "pg_restore");
  const connection = new URL(process.env.DATABASE_URL!);
  for (const key of ["sslmode", "sslrootcert", "sslcert", "sslkey", "options"])
    connection.searchParams.delete(key);
  const schemas = [...new Set(before.map((t) => t.schema))];
  // Credentials travel only in the child environment, never argv or receipts.
  const backupEnv = {
    ...process.env,
    PGDATABASE: connection.toString(),
    PGSSLMODE: "verify-full",
    PGSSLROOTCERT: path.resolve("config/supabase-ca.crt"),
  };
  try {
    await exec(
      dump,
      [
        "--format=custom",
        "--no-owner",
        ...schemas.map((s) => `--schema=${s}`),
        `--file=${backup}`,
      ],
      { env: backupEnv, timeout: 180000, maxBuffer: 1024 * 1024 },
    );
    await chmod(backup, 0o600);
    const { stdout } = await exec(restore, ["--list", backup], {
      timeout: 15000,
    });
    if (!stdout.includes("TABLE DATA")) throw Error("Empty archive");
  } catch {
    throw Error(
      "No migration was applied: backup creation/validation failed. Use a pg_dump client at least as new as the server (set PG_DUMP to its path).",
    );
  }
  const manifest = {
    before,
    maintenance: (
      await db
        .query(
          "select jobname,schedule,command,database,username,active from cron.job where jobname in ('adorable-runtime-maintenance','dreamforge-runtime-maintenance')",
        )
        .catch(() => ({ rows: [] }))
    ).rows,
    backupSha256: createHash("sha256")
      .update(await readFile(backup))
      .digest("hex"),
    site: site.origin,
  };
  await writeFile(
    path.join(backupDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    { mode: 0o600 },
  );
  console.log("Validated private backup:", backup);
  const client = await db.connect();
  try {
    await client.query(
      await readFile(
        "supabase/migrations/202610260000_application_baseline.sql",
        "utf8",
      ),
    );
    await client.query(
      await readFile(
        "supabase/migrations/202610260001_consolidate_application_schema.sql",
        "utf8",
      ),
    );
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  const after = await audit();
  for (const old of before.filter(
    (t) =>
      t.schema === "adorable" ||
      t.schema === "dreamforge" ||
      (t.schema === "public" && t.name === "courses"),
  )) {
    if (
      !after.some(
        (t) =>
          t.schema === "dreamforge" && t.name === old.name && t.oid === old.oid,
      )
    )
      throw Error(
        `Post-migration verification failed for ${old.schema}.${old.name}; retain the backup and inspect before further changes`,
      );
  }
  await writeFile(
    path.join(backupDir, "after.json"),
    JSON.stringify(after, null, 2),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      migrated: true,
      existingTableIdentitiesPreserved: true,
      tables: after,
      backupDir,
    }),
  );
}
try {
  await main();
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Schema consolidation failed",
  );
  process.exitCode = 1;
} finally {
  await db.end();
}
