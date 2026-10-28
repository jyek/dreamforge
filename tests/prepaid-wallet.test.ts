import assert from "node:assert/strict";
import { test, after } from "node:test";
import pg from "pg";
import { APPLICATION_DATABASE_OPTIONS } from "../lib/database-options.mjs";
import { reserveUsage, settleUsage } from "../lib/platform-usage";
import { creditCheckout } from "../lib/payment-credit";
import { POST as paymentStatus } from "../app/api/platform/payment-status/route";
import { tokenHash, type Profile } from "../lib/platform-auth";
import { loadDashboardData } from "../lib/platform-dashboard-data";
const pool = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  options: APPLICATION_DATABASE_OPTIONS,
});
(globalThis as unknown as { dreamforgePool: pg.Pool }).dreamforgePool = pool;
const child = "00000000-0000-4000-8000-000000000095",
  project = "vm-creditfixture";
after(() => pool.end());
test("a paid cash top-up funds one balance exactly once, without adding old-style tokens", async () => {
  process.env.DREAMFORGE_PREPAID_BILLING_ENABLED = "true";
  await pool.query("insert into auth.users(id) values($1)", [child]);
  await pool.query(
    "insert into profiles(id,username,display_name,auth_email,role) values($1,'credit_fixture','Credit fixture','credit@tests.invalid','child')",
    [child],
  );
  await pool.query(
    "insert into projects(vm_id,owner_id,metadata) values($1,$2,'{}')",
    [project, child],
  );
  await pool.query(
    "insert into token_accounts(child_id,token_limit) values($1,0)",
    [child],
  );
  assert.equal(
    Number(
      (
        await pool.query(
          "select credit_limit_micros from token_accounts where child_id=$1",
          [child],
        )
      ).rows[0].credit_limit_micros,
    ),
    10000000,
  );
  // Separate starter credit from the payment idempotency assertions below.
  await pool.query(
    "update token_accounts set credit_limit_micros=0 where child_id=$1",
    [child],
  );
  const session = {
    id: "cs_test_creditfixture",
    livemode: false,
    payment_status: "paid",
    mode: "payment",
    currency: "sgd",
    amount_total: 1000,
    metadata: { child_id: child, package: "credit-10-v1" },
  };
  await Promise.all([creditCheckout(session), creditCheckout(session)]);
  const w = (
    await pool.query("select * from token_accounts where child_id=$1", [child])
  ).rows[0];
  assert.equal(Number(w.token_limit), 0);
  assert.equal(Number(w.credit_limit_micros), 10000000);
  await pool.query(
    "insert into topup_requests(token_hash,child_id) values($1,$2)",
    [tokenHash("credit-link"), child],
  );
  const r = await paymentStatus(
    new Request("https://fixture.invalid/api/platform/payment-status", {
      method: "POST",
      headers: {
        Origin: "https://fixture.invalid",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: "credit-link", session: session.id }),
    }),
  );
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), {
    credited: true,
    tokens: 0,
    remaining: 0,
    creditAddedMicros: 10000000,
    availableCreditMicros: 10000000,
    prepaid: true,
  });
});
test("Basic and Advanced spend the same balance at distinct prices; exact usage releases excess holds", async () => {
  const a = await reserveUsage(child, project, 1000, "z-ai/glm-5.3-flash");
  const b = await reserveUsage(
    child,
    project,
    1000,
    "anthropic/claude-sonnet-5.5",
  );
  assert.equal(await settleUsage(a, 100, 50, "z-ai/glm-5.3-flash"), 81);
  assert.equal(
    await settleUsage(b, 100, 50, "anthropic/claude-sonnet-5.5"),
    1418,
  );
  assert.equal(
    await settleUsage(b, 100, 50, "anthropic/claude-sonnet-5.5"),
    undefined,
  );
  const w = (
    await pool.query("select * from token_accounts where child_id=$1", [child])
  ).rows[0];
  assert.equal(Number(w.credit_used_micros), 1499);
  assert.equal(Number(w.credit_reserved_micros), 0);
  assert.equal(Number(w.reserved_tokens), 0);
  const d = await loadDashboardData({
    id: child,
    role: "child",
    display_name: "Credit fixture",
    username: "credit_fixture",
  } as Profile);
  assert.equal(d.prepaid, true);
  assert.equal(Number(d.wallet.credit_used_micros), 1499);
  assert.equal(Number(d.projectUsage[0].credit_cost_micros), 1499);
  assert.equal(d.projectUsage[0].models.length, 2);
  assert.equal(
    d.projectUsage[0].models.find((m) => m.model === "z-ai/glm-5.3-flash")
      ?.credit_cost_micros,
    "81",
  );
  assert.equal(d.projectUsage[0].estimated_credit_micros, "0");
});
test("concurrent reservations cannot overspend; unknown or over-bound usage remains held without overdraft", async () => {
  const runs = await Promise.allSettled([
    reserveUsage(child, project, 200000, "openai/gpt-6.1-sol"),
    reserveUsage(child, project, 200000, "openai/gpt-6.1-sol"),
  ]);
  assert.equal(runs.filter((r) => r.status === "fulfilled").length, 1);
  for (const r of runs)
    if (r.status === "fulfilled")
      await settleUsage(r.value, 0, 0, "openai/gpt-6.1-sol");
  const id = await reserveUsage(
    child,
    project,
    100,
    "anthropic/claude-sonnet-5.5",
  );
  await settleUsage(id);
  await settleUsage(id, 1, 1, "anthropic/claude-sonnet-5.5");
  const over = await reserveUsage(child, project, 10, "z-ai/glm-5.3-flash");
  await settleUsage(over, 1000000, 1000000, "z-ai/glm-5.3-flash");
  const w = (
    await pool.query("select * from token_accounts where child_id=$1", [child])
  ).rows[0];
  assert.equal(Number(w.credit_used_micros), 1499);
  assert.equal(Number(w.credit_reserved_micros), 2036);
  assert.equal(Number(w.reserved_tokens), 0);
});
test("earlier token packages are honoured at conversion value after launch, and earlier credited receipts cannot grant again", async () => {
  await creditCheckout({
    id: "cs_test_oldtokencreditfixture",
    livemode: false,
    payment_status: "paid",
    mode: "payment",
    currency: "sgd",
    amount_total: 500,
    metadata: { child_id: child, package: "spark" },
  });
  const w = (
    await pool.query("select * from token_accounts where child_id=$1", [child])
  ).rows[0];
  assert.equal(Number(w.credit_limit_micros), 15000000);
  assert.equal(Number(w.token_limit), 0);
});

test("conversion preserves old balances and receipts, refuses unresolved usage, and cannot apply twice", async () => {
  const { readFile } = await import("node:fs/promises");
  const { randomUUID } = await import("node:crypto");
  const name = `credit_${randomUUID().replaceAll("-", "")}`;
  const url = new URL(process.env.TEST_DATABASE_URL!);
  const admin = new pg.Pool({ connectionString: url.toString() });
  await admin.query(`create database "${name}"`);
  url.pathname = `/${name}`;
  const fixture = new pg.Pool({
    connectionString: url.toString(),
    options: APPLICATION_DATABASE_OPTIONS,
    max: 1,
  });
  const c = await fixture.connect();
  try {
    await c.query(
      "create schema auth;create table auth.users(id uuid primary key)",
    );
    for (const f of [
      "202610260000_application_baseline.sql",
      "202610260001_consolidate_application_schema.sql",
    ])
      await c.query(await readFile(`supabase/migrations/${f}`, "utf8"));
    await c.query("insert into auth.users values($1)", [child]);
    await c.query(
      "insert into profiles(id,username,display_name,auth_email,role) values($1,'conversion','Conversion','conversion@tests.invalid','child')",
      [child],
    );
    await c.query(
      "insert into projects(vm_id,owner_id,metadata) values($1,$2,'{}')",
      [project, child],
    );
    await c.query(
      "insert into token_accounts(child_id,token_limit,used_tokens) values($1,1000,100)",
      [child],
    );
    await c.query(
      "insert into payments(stripe_session_id,child_id,amount_sgd_cents,tokens) values('cs_test_beforeconversion',$1,500,1000)",
      [child],
    );
    await c.query(
      "insert into usage_runs(child_id,vm_id,reserved_tokens,state) values($1,$2,10,'uncertain')",
      [child, project],
    );
    const sql = await readFile(
      "supabase/migrations/202610280000_prepaid_credit.sql",
      "utf8",
    );
    await assert.rejects(() => c.query(sql), /Resolve all usage reservations/);
    await c.query("rollback");
    assert.equal(
      (
        await c.query(
          "select count(*)::int as n from information_schema.columns where table_schema='dreamforge' and table_name='token_accounts' and column_name='credit_limit_micros'",
        )
      ).rows[0].n,
      0,
    );
    await c.query("update usage_runs set state='released'");
    await c.query(sql);
    const w = (
      await c.query("select * from token_accounts where child_id=$1", [child])
    ).rows[0];
    assert.equal(Number(w.credit_limit_micros), 4500);
    assert.equal(Number(w.token_limit), 1000);
    assert.equal(Number(w.used_tokens), 100);
    const receipt = (
      await c.query(
        "select * from payments where stripe_session_id='cs_test_beforeconversion'",
      )
    ).rows[0];
    assert.equal(Number(receipt.tokens), 1000);
    assert.equal(receipt.credit_micros, null);
    await assert.rejects(() => c.query(sql), /already exists/);
    await c.query("rollback");
    assert.equal(
      Number(
        (
          await c.query(
            "select credit_limit_micros from token_accounts where child_id=$1",
            [child],
          )
        ).rows[0].credit_limit_micros,
      ),
      4500,
    );
    await c.query("set role authenticated");
    await assert.rejects(
      () =>
        c.query("select credit_limit_micros from dreamforge.token_accounts"),
      /permission denied/,
    );
    await c.query("reset role");
  } finally {
    c.release();
    await fixture.end();
    await admin.query(`drop database "${name}" with (force)`);
    await admin.end();
  }
});

test("cached input uses its own cost plus 50 percent and retains auditable usage details", async () => {
  const id = await reserveUsage(
    child,
    project,
    2000,
    "anthropic/claude-sonnet-5.5",
  );
  assert.equal(
    await settleUsage(id, 1000, 50, "anthropic/claude-sonnet-5.5", {
      cacheReadTokens: 900,
    }),
    1600,
  );
  const {
    rows: [row],
  } = await pool.query(
    "select credit_cost_micros,cache_read_tokens,cache_write_tokens,estimated_cost_usd,billing_version from usage_runs where id=$1",
    [id],
  );
  assert.equal(Number(row.cache_read_tokens), 900);
  assert.equal(Number(row.credit_cost_micros), 1600);
  assert.equal(Number(row.estimated_cost_usd), 0.00079);
  assert.match(row.billing_version, /cost-plus-50/);
});
