// @suite database
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID, createHmac } from "node:crypto";
import pg from "pg";
import { APPLICATION_DATABASE_OPTIONS } from "../lib/database-options.mjs";
import { POST as checkout } from "../app/api/platform/checkout/route";
import { POST as webhook } from "../app/api/platform/stripe/route";
import { POST as status } from "../app/api/platform/payment-status/route";
import { reserveUsage, settleUsage } from "../lib/platform-usage";
import { tokenHash } from "../lib/platform-auth";
import { MODELS } from "../lib/model-catalog";
import { clearPaymentFixtureRecords } from "../scripts/e2e-payment-account.mjs";

const pool = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  options: APPLICATION_DATABASE_OPTIONS,
});
(globalThis as unknown as { dreamforgePool: pg.Pool }).dreamforgePool = pool;
const originalFetch = globalThis.fetch;
after(async () => {
  globalThis.fetch = originalFetch;
  await pool.end();
});
const origin = "https://fixture.invalid";
const child = "00000000-0000-4000-8000-000000000096";
const token = "checkout-fixture-link";
const project = "vm-checkoutfixture";
const request = (body: unknown) =>
  new Request(origin + "/api/platform/checkout", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

test("unfunded wallet → real checkout route → signed delivery → one credit → affordable prompt usage", async () => {
  Object.assign(process.env, {
    DREAMFORGE_PREPAID_BILLING_ENABLED: "true",
    DREAMFORGE_PAYMENT_MODE: "sandbox",
    DREAMFORGE_PAYMENTS_ENABLED: "true",
    STRIPE_SECRET_KEY: "sk_test_fixture",
    STRIPE_WEBHOOK_SECRET: "whsec_fixture",
    DREAMFORGE_SITE_URL: origin,
  });
  await pool.query("insert into auth.users(id) values($1)", [child]);
  await pool.query(
    "insert into profiles(id,username,display_name,auth_email,role) values($1,'checkout_fixture','Checkout','checkout@tests.invalid','child')",
    [child],
  );
  await pool.query(
    "insert into projects(vm_id,owner_id,metadata) values($1,$2,'{}')",
    [project, child],
  );
  await pool.query(
    "insert into token_accounts(child_id,token_limit,credit_limit_micros) values($1,0,0)",
    [child],
  );
  await pool.query(
    "insert into topup_requests(token_hash,child_id) values($1,$2)",
    [tokenHash(token), child],
  );
  await assert.rejects(
    () => reserveUsage(child, project, 1000, MODELS.glm.id),
    /credit/i,
  );
  const keys: string[] = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://api.stripe.com/v1/checkout/sessions");
    const params = new URLSearchParams(String(init?.body));
    assert.equal(params.get("metadata[child_id]"), child);
    assert.equal(params.get("metadata[package]"), "credit-10-v1");
    assert.equal(params.get("line_items[0][price_data][unit_amount]"), "1000");
    assert.equal(params.get("line_items[0][price_data][currency]"), "sgd");
    assert.equal(
      params.get("success_url"),
      `${origin}/pay/${token}?paid=1&session_id={CHECKOUT_SESSION_ID}`,
    );
    keys.push(new Headers(init?.headers).get("Idempotency-Key")!);
    return Response.json({
      url: "https://checkout.stripe.com/c/pay/cs_test_fixture",
    });
  };
  const attemptId = randomUUID();
  for (let i = 0; i < 2; i++)
    assert.equal(
      (await checkout(request({ token, package: "credit-10-v1", attemptId })))
        .status,
      200,
    );
  assert.equal(
    keys[0],
    keys[1],
    "A retry reuses the same Stripe checkout attempt",
  );
  await checkout(
    request({ token, package: "credit-10-v1", attemptId: randomUUID() }),
  );
  assert.notEqual(keys[0], keys[2]);
  const session = {
    id: "cs_test_checkoutfixture",
    livemode: false,
    payment_status: "paid",
    mode: "payment",
    currency: "sgd",
    amount_total: 1000,
    metadata: { child_id: child, package: "credit-10-v1" },
  };
  const raw = JSON.stringify({
    type: "checkout.session.completed",
    livemode: false,
    data: { object: session },
  });
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", "whsec_fixture")
    .update(`${t}.${raw}`)
    .digest("hex");
  const deliver = () =>
    webhook(
      new Request(origin + "/api/platform/stripe", {
        method: "POST",
        headers: { "stripe-signature": `t=${t},v1=${sig}` },
        body: raw,
      }),
    );
  for (const r of await Promise.all([deliver(), deliver(), deliver()]))
    assert.equal(r.status, 200);
  const r = await status(
    new Request(origin + "/api/platform/payment-status", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ token, session: session.id }),
    }),
  );
  assert.equal((await r.json()).availableCreditMicros, 10000000);
  const id = await reserveUsage(child, project, 1000, MODELS.glm.id);
  const charged = await settleUsage(id, 100, 50, MODELS.glm.id);
  await settleUsage(id, 100, 50, MODELS.glm.id);
  const {
    rows: [wallet],
  } = await pool.query("select * from token_accounts where child_id=$1", [
    child,
  ]);
  assert.equal(Number(wallet.credit_limit_micros), 10000000);
  assert.equal(Number(wallet.credit_used_micros), charged);
  assert.equal(Number(wallet.credit_reserved_micros), 0);
  assert.equal(
    (
      await pool.query(
        "select count(*)::int as n from payments where child_id=$1",
        [child],
      )
    ).rows[0].n,
    1,
  );
});

test("checkout denies bad links and requests, and safely handles Stripe transport, HTTP, JSON and URL failures", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw Error("private transport detail");
  };
  for (const [body, expected] of [
    [null, 400],
    [{ token: "expired", package: "credit-10-v1" }, 404],
    [{ token, package: "spark" }, 400],
    [{ token, package: "credit-10-v1", attemptId: "bad" }, 400],
  ] as const)
    assert.equal((await checkout(request(body))).status, expected);
  const foreign = request({ token, package: "credit-10-v1" });
  foreign.headers.set("Origin", "https://foreign.invalid");
  assert.equal((await checkout(foreign)).status, 403);
  assert.equal(calls, 0);
  for (const failure of [
    async () => {
      throw Error("private key details");
    },
    async () => new Response("bad gateway", { status: 502 }),
    async () => new Response("not json"),
    async () => Response.json({}),
    async () => Response.json({ url: "https://evil.invalid/pay" }),
    async () => Response.json({ url: "http://checkout.stripe.com/pay" }),
  ]) {
    globalThis.fetch = failure;
    const r = await checkout(
      request({ token, package: "credit-10-v1", attemptId: randomUUID() }),
    );
    assert.equal(r.status, 503);
    assert.deepEqual(await r.json(), {
      error: "Payment service is unavailable. Please try again.",
    });
  }
});

test("sandbox cleanup refuses ordinary accounts, remaining projects and live receipts before deleting anything", async () => {
  await assert.rejects(() =>
    clearPaymentFixtureRecords(pool, {
      id: child,
      username: "checkout_fixture",
      email: "checkout@tests.invalid",
    }),
  );
  const id = "00000000-0000-4000-8000-000000000097";
  const username = "e2e_123456abcdef",
    email = `${username}@tests.dreamforge.invalid`;
  await pool.query("insert into auth.users(id) values($1)", [id]);
  await pool.query(
    "insert into profiles(id,username,auth_email,display_name,role) values($1,$2,$3,'Cleanup','child')",
    [id, username, email],
  );
  await pool.query(
    "insert into topup_requests(token_hash,child_id) values('cleanupfixture',$1)",
    [id],
  );
  await pool.query(
    "insert into payments(stripe_session_id,child_id,amount_sgd_cents,tokens) values('cs_live_cleanupfixture',$1,1000,0)",
    [id],
  );
  const account = { id, username, email };
  await assert.rejects(
    () => clearPaymentFixtureRecords(pool, account),
    /non-test/,
  );
  await pool.query(
    "update payments set stripe_session_id='cs_test_cleanupfixture' where child_id=$1",
    [id],
  );
  await pool.query(
    "insert into projects(vm_id,owner_id,metadata) values('vm-paymentcleanupfixture',$1,'{}')",
    [id],
  );
  await assert.rejects(
    () => clearPaymentFixtureRecords(pool, account),
    /Project cleanup required/,
  );
  assert.equal(
    (
      await pool.query(
        "select count(*)::int as n from payments where child_id=$1",
        [id],
      )
    ).rows[0].n,
    1,
  );
  await pool.query("delete from projects where owner_id=$1", [id]);
  await clearPaymentFixtureRecords(pool, account);
  assert.equal(
    (
      await pool.query(
        "select count(*)::int as n from payments where child_id=$1",
        [id],
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await pool.query(
        "select count(*)::int as n from topup_requests where child_id=$1",
        [id],
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await pool.query(
        "select count(*)::int as n from payments where child_id=$1",
        [child],
      )
    ).rows[0].n,
    1,
    "Other accounts' receipts stay intact",
  );
});
