import assert from "node:assert/strict";
import { test, after } from "node:test";
import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
(globalThis as unknown as { dreamforgePool: pg.Pool }).dreamforgePool = pool;
import { reserveTokens, settleTokens } from "../lib/token-quota";
import {
  redactIdentity,
  codeRisk,
  screenContent,
  SafetyError,
} from "../lib/kids-safety";
const user = "00000000-0000-4000-8000-000000000001",
  project = "00000000-0000-4000-8000-000000000002";
after(() => pool.end());
test("atomic reservations prevent simultaneous requests overspending", async () => {
  await pool.query("insert into auth.users(id) values($1)", [user]);
  await pool.query("insert into projects(id,owner_id) values($1,$2)", [
    project,
    user,
  ]);
  const results = await Promise.allSettled([
    reserveTokens(user, project, 60, 100, "test:free"),
    reserveTokens(user, project, 60, 100, "test:free"),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const id = (
    results.find(
      (r) => r.status === "fulfilled",
    ) as PromiseFulfilledResult<string>
  ).value;
  await settleTokens(id, 10, 5);
  await settleTokens(id, 10, 5);
  const { rows } = await pool.query(
    "select * from token_budgets where user_id=$1",
    [user],
  );
  assert.equal(Number(rows[0].used_tokens), 15);
  assert.equal(Number(rows[0].reserved_tokens), 0);
  const next = await reserveTokens(user, project, 80, 100, "test:free");
  await settleTokens(next, 0, 0, true);
  await assert.rejects(() => reserveTokens(user, project, 6, 100, "test:free"));
});
test("anonymous browser role cannot change token budgets or safety approvals", async () => {
  const client = await pool.connect();
  try {
    await client.query("set role authenticated");
    await assert.rejects(
      () => client.query("select * from token_budgets"),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        client.query(
          "update harness_safety_events set review_status='allowed'",
        ),
      /permission denied/,
    );
  } finally {
    await client.query("reset role");
    client.release();
  }
});
test("privacy redaction removes roster aliases, emails, phone numbers and keys", () => {
  const safe = redactIdentity(
    "Alex email alex@example.com phone +65 9123 4567 key sk-or-v1-secret123",
    ["Alex"],
  );
  assert.ok(!safe.includes("Alex"));
  assert.ok(!safe.includes("alex@example.com"));
  assert.ok(!safe.includes("9123"));
  assert.ok(!safe.includes("secret123"));
});
test("generated code with system access or network access is rejected", () => {
  assert.equal(codeRisk("import fs from 'node:fs'"), true);
  assert.equal(codeRisk("fetch('https://example.com')"), true);
  assert.equal(codeRisk("const [count,setCount]=useState(0)"), false);
});
test("missing moderation service fails closed", async () => {
  delete process.env.STUDENT_MODERATION_URL;
  await assert.rejects(
    () => screenContent(project, user, "input", "Create a counter"),
    SafetyError,
  );
});
test("under-13 high severity cannot be overridden by an allow label", async () => {
  process.env.STUDENT_MODERATION_URL = "http://moderation.test";
  process.env.STUDENT_MODERATION_KEY = "test";
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
      "select decision,severity from harness_safety_events",
    );
    assert.equal(rows[0].decision, "block");
  } finally {
    globalThis.fetch = original;
  }
});

test("adult demo local checks log without an account", async () => {
  process.env.STUDENT_LOGIN_ENABLED = "false";
  process.env.DREAMFORGE_AUTH_ENABLED = "false";
  process.env.SAFETY_ENABLED = "false";
  const vm = "vm-safetytest";
  await pool.query("insert into adorable.projects(vm_id) values($1)", [vm]);
  delete process.env.STUDENT_MODERATION_URL;
  delete process.env.STUDENT_MODERATION_KEY;
  assert.ok(await screenContent(vm, null, "input", "Create a counter"));
  await assert.rejects(
    () => screenContent(vm, null, "input", "Build a phishing site"),
    SafetyError,
  );
  const { rows } = await pool.query(
    "select decision from adorable.safety_events order by created_at",
  );
  assert.deepEqual(
    rows.map((r) => r.decision),
    ["allow", "block"],
  );
  const db = await pool.connect();
  try {
    await db.query("set role anon");
    await assert.rejects(
      () => db.query("select * from adorable.safety_events"),
      /permission denied/,
    );
  } finally {
    await db.query("reset role");
    db.release();
  }
});
