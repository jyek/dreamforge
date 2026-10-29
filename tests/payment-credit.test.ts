// @suite database
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import pg from "pg";
import { APPLICATION_DATABASE_OPTIONS } from "../lib/database-options.mjs";
import { creditCheckout, type CheckoutSession } from "../lib/payment-credit";
import { POST, GET } from "../app/api/platform/payment-status/route";
import { POST as webhook } from "../app/api/platform/stripe/route";
import { tokenHash } from "../lib/platform-auth";
import { createHmac } from "node:crypto";
const pool = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  options: APPLICATION_DATABASE_OPTIONS,
});
(globalThis as unknown as { dreamforgePool: pg.Pool }).dreamforgePool = pool;
const child = "00000000-0000-4000-8000-000000000091";
const token = "payment-fixture-link";
const session = (id: string): CheckoutSession => ({
  id: `cs_test_${id}`,
  livemode: false,
  payment_status: "paid",
  mode: "payment",
  currency: "sgd",
  amount_total: 500,
  metadata: { child_id: child, package: "spark" },
});
const originalFetch = globalThis.fetch;
before(async () => {
  process.env.DREAMFORGE_PAYMENT_MODE = "sandbox";
  process.env.DREAMFORGE_PAYMENTS_ENABLED = "true";
  process.env.STRIPE_SECRET_KEY = "sk_test_fixture";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_fixture";
  process.env.DREAMFORGE_SITE_URL = "https://fixture.invalid";
  await pool.query("insert into auth.users(id) values($1)", [child]);
  await pool.query(
    "insert into profiles(id,username,display_name,auth_email,role) values($1,'payment_fixture','Payment fixture','payment@tests.invalid','child')",
    [child],
  );
  await pool.query(
    "insert into token_accounts(child_id,token_limit,used_tokens,reserved_tokens) values($1,1000,100,50)",
    [child],
  );
  await pool.query(
    "insert into topup_requests(token_hash,child_id) values($1,$2)",
    [tokenHash(token), child],
  );
});
after(async () => {
  globalThis.fetch = originalFetch;
  await pool.end();
});
function request(
  id: string,
  bodyToken = token,
  origin = "https://fixture.invalid",
) {
  return new Request("https://fixture.invalid/api/platform/payment-status", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify({ token: bodyToken, session: id }),
  });
}
test("concurrent webhook and return-page credits are exactly once; unpaid and mismatched sessions never credit", async () => {
  await Promise.all([
    creditCheckout(session("race")),
    creditCheckout(session("race")),
    creditCheckout(session("race")),
  ]);
  assert.equal(
    Number(
      (
        await pool.query(
          "select credit_limit_micros from token_accounts where child_id=$1",
          [child],
        )
      ).rows[0].credit_limit_micros,
    ),
    15000000,
  );
  for (const invalid of [
    { payment_status: "unpaid" },
    { livemode: true },
    { amount_total: 1 },
    { currency: "usd" },
    { mode: "subscription" },
    { metadata: { child_id: child, package: "unknown" } },
  ]) {
    assert.equal(
      await creditCheckout({ ...session("invalid"), ...invalid }),
      false,
    );
  }
  assert.equal(
    await creditCheckout(session("wrongowner"), "another-child"),
    false,
  );
});
test("return page reconciles a paid Stripe session without a webhook and returns the current available balance", async () => {
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    assert.equal(
      String(input),
      "https://api.stripe.com/v1/checkout/sessions/cs_test_return",
    );
    assert.equal(
      (init?.headers as Record<string, string>).Authorization,
      "Bearer sk_test_fixture",
    );
    return Response.json(session("return"));
  };
  const r = await POST(request("cs_test_return"));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), {
    credited: true,
    tokens: 1000000,
    remaining: 850,
    creditAddedMicros: 5000000,
    availableCreditMicros: 20000000,
    prepaid: true,
  });
  assert.match(r.headers.get("cache-control")!, /no-store/);
  await POST(request("cs_test_return"));
  assert.equal(
    calls,
    1,
    "already credited sessions don't call Stripe or add tokens again",
  );
  const raw = JSON.stringify({
    type: "checkout.session.completed",
    livemode: false,
    data: { object: session("return") },
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", "whsec_fixture")
    .update(`${timestamp}.${raw}`)
    .digest("hex");
  assert.equal(
    (
      await webhook(
        new Request("https://fixture.invalid/api/platform/stripe", {
          method: "POST",
          headers: { "stripe-signature": `t=${timestamp},v1=${sig}` },
          body: raw,
        }),
      )
    ).status,
    200,
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
    20000000,
  );
  const read = await GET(
    new Request(
      `https://fixture.invalid/api/platform/payment-status?token=${token}&session=cs_test_return`,
    ),
  );
  assert.equal((await read.json()).availableCreditMicros, 20000000);
});
test("status denies other accounts, expired links, cross-origin requests and unverified Stripe failures", async () => {
  globalThis.fetch = async () =>
    Response.json({
      ...session("foreign"),
      metadata: {
        child_id: "00000000-0000-4000-8000-000000000092",
        package: "spark",
      },
    });
  assert.equal((await POST(request("cs_test_foreign"))).status, 400);
  assert.equal((await POST(request("cs_test_foreign", "expired"))).status, 404);
  assert.equal(
    (await POST(request("cs_test_foreign", token, "https://foreign.invalid")))
      .status,
    403,
  );
  globalThis.fetch = async () =>
    Response.json({ error: "fixture outage" }, { status: 503 });
  const unavailable = await POST(request("cs_test_unavailable"));
  assert.equal(unavailable.status, 503);
  assert.match((await unavailable.json()).error, /don’t need to pay again/);
  globalThis.fetch = async () =>
    Response.json({ ...session("pending"), payment_status: "unpaid" });
  assert.deepEqual(await (await POST(request("cs_test_pending"))).json(), {
    credited: false,
    tokens: 0,
    remaining: null,
    prepaid: true,
    creditAddedMicros: null,
    availableCreditMicros: null,
  });
  assert.equal(
    (
      await pool.query(
        "select count(*)::int as count from payments where child_id=$1",
        [child],
      )
    ).rows[0].count,
    2,
  );
});
test("a missing wallet rolls back its payment receipt so delivery can be retried", async () => {
  const missing = "00000000-0000-4000-8000-000000000093";
  await pool.query("insert into auth.users(id) values($1)", [missing]);
  await pool.query(
    "insert into profiles(id,username,display_name,auth_email,role) values($1,'payment_missing','Missing','missing@tests.invalid','child')",
    [missing],
  );
  await assert.rejects(
    () =>
      creditCheckout({
        ...session("missing"),
        metadata: { child_id: missing, package: "spark" },
      }),
    /Missing token account/,
  );
  assert.equal(
    (
      await pool.query(
        "select count(*)::int as count from payments where stripe_session_id='cs_test_missing'",
      )
    ).rows[0].count,
    0,
  );
});
