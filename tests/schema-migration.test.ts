// @suite database
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { backupEnvironment } from "../scripts/database-backup.mjs";
import { readFileSync } from "node:fs";
import pg from "pg";
import { APPLICATION_DATABASE_OPTIONS } from "../lib/database-options.mjs";
const migration = readFileSync(
  "supabase/migrations/202610260001_consolidate_application_schema.sql",
  "utf8",
);
const teacher = "00000000-0000-4000-9000-000000000001",
  child = "00000000-0000-4000-9000-000000000002",
  classId = "00000000-0000-4000-9000-000000000003";
async function fixture(run: (client: pg.Client, uri: string) => Promise<void>) {
  const name = `schema_${randomUUID().replaceAll("-", "")}`;
  const url = new URL(process.env.TEST_DATABASE_URL!);
  const admin = new pg.Client({ connectionString: url.toString() });
  await admin.connect();
  await admin.query(`create database "${name}"`);
  url.pathname = `/${name}`;
  const client = new pg.Client({
    connectionString: url.toString(),
    options: APPLICATION_DATABASE_OPTIONS,
  });
  await client.connect();
  try {
    await client.query(
      "create schema auth;create table auth.users(id uuid primary key)",
    );
    for (const file of (await readdir("supabase/history")).sort()) {
      if (
        file === "202610100006_student_harness.sql" ||
        file.startsWith("20261026")
      )
        continue;
      await client.query(await readFile(`supabase/history/${file}`, "utf8"));
    }
    await client.query(`create table public.projects(id uuid primary key);
      create table public.project_members(project_id uuid references public.projects);
      create table public.students(id uuid primary key);
      create table public.courses(id integer primary key,title text);
      insert into public.courses values(1,'Course A'),(2,'Course B'),(3,'Course C'),(4,'Course D');
      create function public.dreamforge_reads_project(project uuid) returns boolean language sql as 'select exists(select 1 from public.projects where id=project)';
      alter table public.students enable row level security;
      create policy legacy_student_policy on public.students using (public.dreamforge_reads_project(id));`);
    await client.query("insert into auth.users values($1),($2)", [
      teacher,
      child,
    ]);
    await client.query(
      "insert into profiles(id,username,display_name,auth_email,role) values($1,'teacher_test','Teacher','t@tests.invalid','teacher'),($2,'child_test','Child','c@tests.invalid','child')",
      [teacher, child],
    );
    await client.query(
      "insert into classes(id,teacher_id,name,invite_code) values($1,$2,'Test class','TESTCODE')",
      [classId, teacher],
    );
    await client.query(
      "insert into class_members(class_id,child_id) values($1,$2)",
      [classId, child],
    );
    await client.query(
      "insert into projects(vm_id,owner_id,metadata) values('vm-preserved',$1,'{}')",
      [child],
    );
    await client.query(
      'insert into conversations(vm_id,id,messages) values(\'vm-preserved\',$1,\'[{"role":"user","parts":[]}]\')',
      [randomUUID()],
    );
    await client.query(
      "insert into token_accounts(child_id,token_limit,used_tokens,reserved_tokens) values($1,1000,123,45)",
      [child],
    );
    await client.query(
      readFileSync(
        "supabase/migrations/202610260000_application_baseline.sql",
        "utf8",
      ),
    );
    assert.equal(
      (await client.query("select to_regnamespace('dreamforge') as existing"))
        .rows[0].existing,
      null,
      "The fresh-install baseline must leave an existing deployment untouched",
    );
    await run(client, url.toString());
  } finally {
    await client.query("rollback").catch(() => {});
    // Await the socket closing before DROP DATABASE can terminate it.
    await client.end();
    try {
      await admin.query(`drop database "${name}" with (force)`);
    } finally {
      await admin.end();
    }
  }
}
test("schema migration preserves data, ownership, roster trigger and access restrictions across the rename", () =>
  fixture(async (client) => {
    const before = (
      await client.query(
        "select oid from pg_class where oid='adorable.profiles'::regclass",
      )
    ).rows[0].oid;
    // The same pool connection works before and after the cutover.
    assert.equal(
      (await client.query("select count(*)::int as n from profiles")).rows[0].n,
      2,
    );
    await client.query(migration);
    const {
      rows: [names],
    } = await client.query(
      "select to_regnamespace('adorable') as old,to_regnamespace('dreamforge') as current,to_regclass('public.projects') as legacy",
    );
    assert.equal(names.old, null);
    assert(names.current);
    assert.equal(names.legacy, null);
    assert.equal(
      (
        await client.query(
          "select oid from pg_class where oid='dreamforge.profiles'::regclass",
        )
      ).rows[0].oid,
      before,
    );
    assert.equal(
      (await client.query("select count(*)::int as n from profiles")).rows[0].n,
      2,
    );
    assert.equal(
      (await client.query("select count(*)::int as n from courses")).rows[0].n,
      4,
    );
    assert.equal(
      (await client.query("select owner_id from projects")).rows[0].owner_id,
      child,
    );
    assert.equal(
      (await client.query("select messages from conversations")).rows[0]
        .messages[0].role,
      "user",
    );
    const balance = (
      await client.query(
        "select used_tokens,reserved_tokens from token_accounts",
      )
    ).rows[0];
    assert.equal(Number(balance.used_tokens), 123);
    assert.equal(Number(balance.reserved_tokens), 45);
    await client.query("delete from teacher_builders");
    await client.query("delete from class_members");
    await client.query(
      "insert into class_members(class_id,child_id) values($1,$2)",
      [classId, child],
    );
    assert.equal(
      (await client.query("select child_id from teacher_builders")).rows[0]
        .child_id,
      child,
    );
    await client.query("set role authenticated");
    await assert.rejects(
      () => client.query("select * from dreamforge.profiles"),
      /permission denied/,
    );
    await client.query("reset role");
    await client.query(migration); // Safe to rerun after a completed cutover.
  }));
test("populated legacy tables abort without removing data or renaming the live schema", () =>
  fixture(async (client) => {
    await client.query("insert into public.students values($1)", [child]);
    await assert.rejects(() => client.query(migration), /contains data/);
    await client.query("rollback");
    assert.equal(
      (await client.query("select count(*)::int as n from public.students"))
        .rows[0].n,
      1,
    );
    assert(
      (await client.query("select to_regnamespace('adorable') as existing"))
        .rows[0].existing,
    );
  }));
test("unexpected dependencies roll back the entire migration instead of cascading deletes", () =>
  fixture(async (client) => {
    await client.query(
      "create view public.keep_students as select * from public.students",
    );
    await assert.rejects(() => client.query(migration), /depend/);
    await client.query("rollback");
    assert(
      (await client.query("select to_regnamespace('adorable') as existing"))
        .rows[0].existing,
    );
    assert.equal(
      (await client.query("select count(*)::int as n from public.courses"))
        .rows[0].n,
      4,
    );
    assert.equal(
      (
        await client.query(
          "select count(*)::int as n from pg_policies where policyname='legacy_student_policy'",
        )
      ).rows[0].n,
      1,
    );
  }));
test("active runs prevent the cutover; cron schedule and secret references survive", () =>
  fixture(async (client) => {
    await client.query(
      "insert into project_execution(project_id,active_run) values($1,$2)",
      ["vm-preserved", randomUUID()],
    );
    await assert.rejects(() => client.query(migration), /active project runs/);
    await client.query("rollback");
    await client.query("update project_execution set active_run=null");
    await client.query(`create schema vault;create table vault.secrets(id uuid primary key,name text);
    create function vault.update_secret(secret_id uuid,new_secret text default null,new_name text default null) returns void language sql as 'update vault.secrets set name=new_name where id=secret_id';
    create schema cron;create table cron.job(jobid bigint generated always as identity primary key,jobname text unique,schedule text,command text,database text,username text,active boolean);
    create function cron.schedule_in_database(job_name text,sched text,cmd text,db text,usr text,enabled boolean) returns bigint language plpgsql as 'declare result bigint; begin if usr is not null then raise exception ''must be superuser to create a job for another role''; end if; insert into cron.job(jobname,schedule,command,database,username,active) values(job_name,sched,cmd,db,current_user,enabled) returning jobid into result; return result; end;';
    create function cron.unschedule(job_id bigint) returns boolean language sql as 'delete from cron.job where jobid=job_id returning true';
    insert into vault.secrets values(gen_random_uuid(),'adorable-runtime-cron');
    insert into cron.job(jobname,schedule,command,database,username,active) values('adorable-runtime-maintenance','* * * * *','select 1 from adorable.runtime_leases where ''adorable-runtime-cron'' is not null','postgres',current_user,false);`);
    await client.query("update cron.job set username='another_role'");
    await assert.rejects(
      () => client.query(migration),
      /owned by another role/,
    );
    await client.query("rollback");
    await client.query("update cron.job set username=current_user");
    await client.query(migration);
    const job = (await client.query("select * from cron.job")).rows[0];
    assert.equal(job.jobname, "dreamforge-runtime-maintenance");
    assert.equal(job.schedule, "* * * * *");
    assert.equal(job.active, false);
    assert.equal(
      job.username,
      (await client.query("select current_user as name")).rows[0].name,
    );
    assert(job.command.includes("dreamforge.runtime_leases"));
    assert(job.command.includes("dreamforge-runtime-cron"));
    assert.equal(
      (await client.query("select name from vault.secrets")).rows[0].name,
      "dreamforge-runtime-cron",
    );
  }));

test("native backup connects to the requested database and restores data with private permissions", () =>
  fixture(async (client, uri) => {
    const execute = promisify(execFile);
    const directory = await mkdtemp(
      path.join(tmpdir(), "dreamforge-backup-regression-"),
    );
    const archive = path.join(directory, "application.dump");
    const destination = new URL(uri);
    destination.pathname = "/restore_" + randomUUID().replaceAll("-", "");
    const name = destination.pathname.slice(1);
    let recovery: pg.Client | undefined;
    let created = false;
    try {
      const env = {
        ...backupEnvironment(uri, "config/supabase-ca.crt"),
        PGSSLMODE: "disable",
      }; // This cluster is loopback-only, with no TLS.
      await execute(
        "pg_dump",
        [
          "--format=custom",
          "--no-owner",
          "--schema=adorable",
          "--schema=public",
          `--file=${archive}`,
        ],
        { env },
      );
      assert(
        (
          await execute("pg_restore", ["--list", archive], { env })
        ).stdout.includes("TABLE DATA"),
      );
      await client.query(`create database "${name}"`);
      created = true;
      recovery = new pg.Client({
        connectionString: destination.toString(),
        options: APPLICATION_DATABASE_OPTIONS,
      });
      await recovery.connect();
      await recovery.query(
        "create schema auth;create table auth.users(id uuid primary key)",
      );
      await recovery.query("insert into auth.users values($1),($2)", [
        teacher,
        child,
      ]);
      await execute(
        "pg_restore",
        [
          "--clean",
          "--if-exists",
          "--no-owner",
          "--exit-on-error",
          `--dbname=${name}`,
          archive,
        ],
        {
          env: {
            ...backupEnvironment(
              destination.toString(),
              "config/supabase-ca.crt",
            ),
            PGSSLMODE: "disable",
          },
        },
      );
      assert.equal(
        (await recovery.query("select count(*)::int as n from profiles"))
          .rows[0].n,
        2,
      );
      assert.equal(
        (await recovery.query("select count(*)::int as n from public.courses"))
          .rows[0].n,
        4,
      );
      assert.equal(
        (await recovery.query("select owner_id from projects")).rows[0]
          .owner_id,
        child,
      );
      assert.equal(
        Number(
          (await recovery.query("select reserved_tokens from token_accounts"))
            .rows[0].reserved_tokens,
        ),
        45,
      );
      assert.equal(
        (
          await recovery.query(
            "select has_schema_privilege('authenticated','adorable','usage') as permitted",
          )
        ).rows[0].permitted,
        false,
      );
    } finally {
      await recovery?.end();
      if (created) await client.query(`drop database "${name}" with (force)`);
      await rm(directory, { recursive: true, force: true });
    }
  }));
