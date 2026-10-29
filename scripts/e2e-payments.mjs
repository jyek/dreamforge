import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { config } from "dotenv";
import pg from "pg";
import { APPLICATION_DATABASE_OPTIONS } from "../lib/database-options.mjs";
import { clearPaymentFixtureRecords } from "./e2e-payment-account.mjs";

// Deliberately separate from ordinary student E2E credentials and app env files.
config({ path: ".env.e2e.payments.local", quiet: true });
const output = path.resolve(process.env.E2E_OUTPUT || ".e2e-results/payments");
await mkdir(output, { recursive: true });
const report = { startedAt: new Date().toISOString(), status: "failed" };
let user, pool;
let databaseMatched = false;
const runId = randomUUID();
const username = `e2e_${randomBytes(6).toString("hex")}`;
const email = `${username}@tests.dreamforge.invalid`;
const password = randomBytes(24).toString("base64url");
let authOrigin, headers;
const recovery = path.join(output, "account.json");
try {
  for (const key of [
    "E2E_BASE_URL",
    "E2E_BROWSER_EXECUTABLE",
    "E2E_PAYMENT_DATABASE_URL",
    "E2E_PAYMENT_SUPABASE_URL",
    "E2E_PAYMENT_SUPABASE_ADMIN_KEY",
    "E2E_PAYMENT_STRIPE_SECRET_KEY",
  ])
    assert(process.env[key], `Configure ${key} in .env.e2e.payments.local`);
  assert(
    process.env.E2E_PAYMENT_STRIPE_SECRET_KEY.startsWith("sk_test_"),
    "Payment journeys require a Stripe test key",
  );
  assert(
    !(await readFile(recovery).catch(() => null)),
    "A prior disposable account needs cleanup; see account.json",
  );
  const authUrl = new URL(process.env.E2E_PAYMENT_SUPABASE_URL);
  assert.equal(
    authUrl.protocol,
    "https:",
    "Sandbox admin requests require HTTPS",
  );
  authOrigin = authUrl.origin;
  headers = {
    apikey: process.env.E2E_PAYMENT_SUPABASE_ADMIN_KEY,
    Authorization: `Bearer ${process.env.E2E_PAYMENT_SUPABASE_ADMIN_KEY}`,
    "Content-Type": "application/json",
  };
  pool = new pg.Pool({
    connectionString: process.env.E2E_PAYMENT_DATABASE_URL,
    options: APPLICATION_DATABASE_OPTIONS,
    ssl: {
      rejectUnauthorized: true,
      ca: await readFile("config/supabase-ca.crt", "utf8"),
    },
    max: 1,
    connectionTimeoutMillis: 10000,
  });
  const response = await fetch(authOrigin + "/auth/v1/admin/users", {
    method: "POST",
    headers,
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      app_metadata: { purpose: "dreamforge-payment-e2e", runId },
    }),
    signal: AbortSignal.timeout(20000),
  });
  assert(
    response.ok,
    `Sandbox test-user provisioning failed: HTTP ${response.status}`,
  );
  user = await response.json();
  assert(user.id && user.email === email);
  await writeFile(
    recovery,
    JSON.stringify({ userId: user.id, email, runId, authOrigin }),
    { mode: 0o600 },
  );
  // Ensure the explicitly configured DB belongs to the same Supabase project.
  const { rows } = await pool.query(
    "select id from auth.users where id=$1 and email=$2",
    [user.id, email],
  );
  assert.equal(rows.length, 1, "Sandbox auth and database do not match");
  databaseMatched = true;
  await pool.query(
    "insert into profiles(id,username,display_name,auth_email,role) values($1,$2,'E2E Payment Dreamer',$3,'child')",
    [user.id, username, email],
  );
  await pool.query(
    "insert into token_accounts(child_id,token_limit,credit_limit_micros) values($1,0,0)",
    [user.id],
  );
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/e2e-prompting.mjs"], {
      stdio: "inherit",
      env: {
        ...process.env,
        E2E_LOGIN: username,
        E2E_PASSWORD: password,
        E2E_OUTPUT: output,
        E2E_PAYMENT_JOURNEY: "true",
        E2E_PAYMENT_USER_ID: user.id,
      },
    });
    child.on("error", reject);
    child.on("exit", resolve);
  });
  assert.equal(
    code,
    0,
    "Sandbox payment/prompt journey failed; see latest.json",
  );
  report.status = "passed";
} catch (error) {
  // Errors are fixed assertions/statuses, not raw provider or database messages.
  report.error =
    error?.name === "AssertionError"
      ? error.message.split("\n")[0]
      : "Payment journey setup or infrastructure failed";
  process.exitCode = 1;
  console.error(report.error);
} finally {
  try {
    if (user?.id) {
      const lookup = await fetch(
        `${authOrigin}/auth/v1/admin/users/${user.id}`,
        { headers, signal: AbortSignal.timeout(15000) },
      );
      assert(lookup.ok);
      const account = await lookup.json();
      assert.equal(account.email, email);
      assert.equal(account.app_metadata?.runId, runId);
      // Never delete a runtime's owner before the existing runner cleans it up.
      if (databaseMatched) {
        await clearPaymentFixtureRecords(pool, {
          id: user.id,
          username,
          email,
        });
      }
      const removed = await fetch(
        `${authOrigin}/auth/v1/admin/users/${user.id}`,
        { method: "DELETE", headers, signal: AbortSignal.timeout(15000) },
      );
      assert(removed.ok, "Test account deletion failed");
      const verify = await fetch(
        `${authOrigin}/auth/v1/admin/users/${user.id}`,
        { headers, signal: AbortSignal.timeout(15000) },
      );
      assert.equal(verify.status, 404);
      if (databaseMatched) {
        const { rows } = await pool.query(
          "select id from profiles where id=$1",
          [user.id],
        );
        assert.equal(
          rows.length,
          0,
          "Test profile remains after auth deletion",
        );
      }
      await rm(recovery, { force: true });
      report.accountCleanup = "passed";
    }
  } catch {
    report.status = "failed";
    report.accountCleanup = "failed; retain account.json for recovery";
    process.exitCode = 1;
  }
  await pool?.end();
  report.finishedAt = new Date().toISOString();
  await writeFile(
    path.join(output, "payment-run.json"),
    JSON.stringify(report, null, 2),
    { mode: 0o600 },
  );
}
