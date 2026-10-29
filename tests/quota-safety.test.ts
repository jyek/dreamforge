// @suite database
import assert from "node:assert/strict";
import { test, after } from "node:test";
import pg from "pg";
import { APPLICATION_DATABASE_OPTIONS } from "../lib/database-options.mjs";
import { MODELS } from "../lib/model-catalog";
import { reserveUsage, settleUsage } from "../lib/platform-usage";
import {
  redactIdentity,
  codeRisk,
  screenContent,
  SafetyError,
} from "../lib/kids-safety";
const pool = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  options: APPLICATION_DATABASE_OPTIONS,
});
(globalThis as unknown as { dreamforgePool: pg.Pool }).dreamforgePool = pool;
const user = "00000000-0000-4000-8000-000000000001",
  project = "vm-quotasafety";
after(() => pool.end());
test("atomic account reservations prevent overspending; settlement is idempotent and uncertain usage remains reserved", async () => {
  await pool.query("insert into auth.users(id) values($1)", [user]);
  await pool.query(
    "insert into profiles(id,username,display_name,auth_email,role) values($1,'quota_test','Quota test','quota@tests.invalid','child')",
    [user],
  );
  await pool.query(
    "insert into projects(vm_id,owner_id,metadata) values($1,$2,'{}')",
    [project, user],
  );
  await pool.query(
    "insert into token_accounts(child_id,token_limit,credit_limit_micros) values($1,0,100)",
    [user],
  );
  const results = await Promise.allSettled([
    reserveUsage(user, project, 60),
    reserveUsage(user, project, 60),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const id = (
    results.find(
      (r) => r.status === "fulfilled",
    ) as PromiseFulfilledResult<string>
  ).value;
  await settleUsage(id, 10, 5, MODELS.glm.id);
  await settleUsage(id, 10, 5, MODELS.glm.id);
  let row = (
    await pool.query("select * from token_accounts where child_id=$1", [user])
  ).rows[0];
  assert.equal(Number(row.used_tokens), 15);
  assert.equal(Number(row.reserved_tokens), 0);
  const uncertain = await reserveUsage(user, project, 80);
  await settleUsage(uncertain);
  row = (
    await pool.query("select * from token_accounts where child_id=$1", [user])
  ).rows[0];
  assert.equal(Number(row.used_tokens), 15);
  assert.equal(Number(row.credit_reserved_micros), 81);
  assert.equal(Number(row.reserved_tokens), 0);
  await assert.rejects(() => reserveUsage(user, project, 15));
});
test("browser roles cannot change account balances or safety decisions", async () => {
  const client = await pool.connect();
  try {
    await client.query("set role authenticated");
    await assert.rejects(
      () => client.query("select * from dreamforge.token_accounts"),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        client.query("update dreamforge.safety_events set decision='allow'"),
      /permission denied/,
    );
  } finally {
    await client.query("reset role");
    client.release();
  }
});
test("privacy redaction removes roster aliases, emails, phones and keys", () => {
  const safe = redactIdentity(
    "Alex email alex@example.com phone +65 9123 4567 key sk-or-v1-secret123",
    ["Alex"],
  );
  for (const text of ["Alex", "alex@example.com", "9123", "secret123"])
    assert(!safe.includes(text));
});
test("code risk detection identifies filesystem and network access", () => {
  assert(codeRisk("import fs from 'node:fs'"));
  assert(codeRisk("fetch('https://example.com')"));
  assert(!codeRisk("const [count,setCount]=useState(0)"));
});
test("missing moderation fails closed", async () => {
  delete process.env.STUDENT_MODERATION_URL;
  delete process.env.STUDENT_MODERATION_PROVIDER;
  await assert.rejects(
    () => screenContent(project, user, "input", "Create a counter"),
    SafetyError,
  );
});
test("under-13 high severity cannot be overridden by an allow label", async () => {
  process.env.STUDENT_MODERATION_URL = "https://moderation.test";
  process.env.STUDENT_MODERATION_KEY = "fixture";
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      decision: "allow",
      categories: ["sexual_minors"],
      severity: "critical",
      score: 1,
    });
  try {
    await assert.rejects(
      () => screenContent(project, user, "input", "Synthetic policy fixture"),
      SafetyError,
    );
    const { rows } = await pool.query(
      "select decision,severity from safety_events where vm_id=$1",
      [project],
    );
    assert.equal(rows[0].decision, "block");
  } finally {
    globalThis.fetch = original;
  }
});
test("adult demo local checks use the same private safety-event model", async () => {
  process.env.STUDENT_LOGIN_ENABLED = "false";
  process.env.DREAMFORGE_AUTH_ENABLED = "false";
  process.env.SAFETY_ENABLED = "false";
  const vm = "vm-safetytest";
  await pool.query("insert into projects(vm_id,metadata) values($1,'{}')", [
    vm,
  ]);
  delete process.env.STUDENT_MODERATION_URL;
  delete process.env.STUDENT_MODERATION_KEY;
  assert(await screenContent(vm, null, "input", "Create a counter"));
  await assert.rejects(
    () => screenContent(vm, null, "input", "Build a phishing site"),
    SafetyError,
  );
  assert.deepEqual(
    (
      await pool.query(
        "select decision from safety_events where vm_id=$1 order by created_at",
        [vm],
      )
    ).rows.map((r) => r.decision),
    ["allow", "block"],
  );
  const client = await pool.connect();
  try {
    await client.query("set role anon");
    await assert.rejects(
      () => client.query("select * from dreamforge.safety_events"),
      /permission denied/,
    );
  } finally {
    await client.query("reset role");
    client.release();
  }
});
