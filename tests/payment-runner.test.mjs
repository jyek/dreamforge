import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fixtureEnvironment } from "../scripts/test-suites.mjs";

test("real payment runner refuses missing config, live keys and unresolved prior accounts before provisioning", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "dreamforge-payment-guards-"));
  const runner = path.resolve("scripts/e2e-payments.mjs");
  const env = { ...fixtureEnvironment(), E2E_OUTPUT: dir };
  try {
    let run = spawnSync(process.execPath, [runner], {
      cwd: dir,
      env,
      encoding: "utf8",
      timeout: 10000,
    });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /Configure E2E_BASE_URL/);
    const configured = {
      ...env,
      E2E_BASE_URL: "https://sandbox.invalid",
      E2E_BROWSER_EXECUTABLE: "/fixture/chrome",
      E2E_PAYMENT_DATABASE_URL: "postgresql://fixture@127.0.0.1:1/postgres",
      E2E_PAYMENT_SUPABASE_URL: "https://sandbox.invalid",
      E2E_PAYMENT_SUPABASE_ADMIN_KEY: "private_fixture_key",
      E2E_PAYMENT_STRIPE_SECRET_KEY: "sk_live_do_not_use",
    };
    run = spawnSync(process.execPath, [runner], {
      cwd: dir,
      env: configured,
      encoding: "utf8",
      timeout: 10000,
    });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /require a Stripe test key/);
    assert(!run.stderr.includes("private_fixture_key"));
    await assert.rejects(() => readFile(path.join(dir, "account.json")), {
      code: "ENOENT",
    });
    await writeFile(path.join(dir, "account.json"), '{"retained":true}');
    configured.E2E_PAYMENT_STRIPE_SECRET_KEY = "sk_test_fixture";
    run = spawnSync(process.execPath, [runner], {
      cwd: dir,
      env: configured,
      encoding: "utf8",
      timeout: 10000,
    });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /prior disposable account needs cleanup/);
    assert.deepEqual(
      JSON.parse(await readFile(path.join(dir, "account.json"))),
      { retained: true },
    );
    assert.equal(
      JSON.parse(await readFile(path.join(dir, "payment-run.json"))).status,
      "failed",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
