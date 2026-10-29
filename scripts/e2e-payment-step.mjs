import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";

/** Only the hosted Stripe card form is completed by a person. App assertions run automatically. */
export async function paymentStep({
  page,
  request,
  project,
  conversation,
  check,
  output,
  userId,
  pool,
}) {
  assert(page, "The payment journey requires a visible browser.");
  const wallet = async () =>
    (
      await pool.query(
        "select credit_limit_micros,credit_used_micros,credit_reserved_micros from token_accounts where child_id=$1",
        [userId],
      )
    ).rows[0];
  await check("unfunded prompt is blocked without spending", async () => {
    const balance = await (await request("/api/platform/balance")).json();
    assert(
      Number.isFinite(balance.availableCreditMicros),
      "Credit wallet must be available",
    );
    assert.equal(balance.availableCreditMicros, 0);
    const id = await conversation("unfunded");
    const { revision } = await (
      await request(`/api/projects/${project.id}/execution`)
    ).json();
    const response = await request("/api/chat", {
      revision,
      projectId: project.id,
      conversationId: id,
      modelChoice: "glm",
      messages: [
        {
          id: crypto.randomUUID(),
          role: "user",
          parts: [{ type: "text", text: "Reply hello without using tools." }],
        },
      ],
    });
    const text = await response.text();
    assert.match(text, /Not enough prepaid credit/);
    const w = await wallet();
    assert.equal(Number(w.credit_used_micros), 0);
    assert.equal(Number(w.credit_reserved_micros), 0);
  });
  await check(
    "sandbox checkout delivers credit through the webhook",
    async () => {
      const { link } = await (await request("/api/platform/topups", {})).json();
      assert.equal(
        new URL(link).origin,
        new URL(page.url()).origin,
        "Top-up must stay on the chosen deployment",
      );
      const pay = await page.context().newPage();
      // Keep return-page reconciliation from hiding a missing webhook.
      const statusPattern = "**/api/platform/payment-status*";
      await pay.route(statusPattern, (route) =>
        route.fulfill({
          status: 503,
          json: { error: "Waiting for sandbox webhook" },
        }),
      );
      let sessionId;
      await pay.route("https://checkout.stripe.com/**", async (route) => {
        if (!route.request().isNavigationRequest()) return route.continue();
        try {
          const id = new URL(route.request().url()).pathname.match(
            /\bcs_test_[a-zA-Z0-9]+/,
          )?.[0];
          assert(id, "Refusing a checkout that is not a Stripe test session");
          const response = await fetch(
            `https://api.stripe.com/v1/checkout/sessions/${id}`,
            {
              headers: {
                Authorization: `Bearer ${process.env.E2E_PAYMENT_STRIPE_SECRET_KEY}`,
              },
              signal: AbortSignal.timeout(15000),
            },
          );
          assert(
            response.ok,
            "Could not independently verify sandbox checkout",
          );
          const session = await response.json();
          assert.equal(session.livemode, false);
          assert.equal(session.currency, "sgd");
          assert.equal(session.amount_total, 1000);
          assert.equal(session.metadata?.child_id, userId);
          assert.equal(session.metadata?.package, "credit-10-v1");
          sessionId = id;
          await route.continue();
        } catch {
          await route.abort();
        }
      });
      try {
        await pay.goto(link);
        await pay.getByText("Sandbox payments", { exact: false }).waitFor();
        const card = pay
          .locator("article")
          .filter({ has: pay.getByText("S$10", { exact: true }) });
        await card.getByRole("button", { name: "Top up", exact: true }).click();
        await pay.waitForURL((url) => url.hostname === "checkout.stripe.com", {
          timeout: 30000,
        });
        assert(
          sessionId,
          "Sandbox checkout must be independently verified before card entry",
        );
        console.log(
          "ACTION: Complete the S$10 sandbox checkout in the opened browser with Stripe test card 4242 4242 4242 4242, a future expiry and any CVC. No real card is needed. Five-minute limit.",
        );
        await pay.waitForURL(
          (url) =>
            url.origin === new URL(link).origin &&
            url.searchParams.get("paid") === "1",
          { timeout: 300000 },
        );
        assert(sessionId, "Sandbox session was not verified");
        assert.equal(
          new URL(pay.url()).searchParams.get("session_id"),
          sessionId,
        );
        let receipt;
        for (let attempt = 0; attempt < 30; attempt++) {
          receipt = (
            await pool.query(
              "select credit_micros from payments where child_id=$1 and stripe_session_id=$2",
              [userId, sessionId],
            )
          ).rows[0];
          if (receipt) break;
          await delay(2000);
        }
        assert.equal(
          Number(receipt?.credit_micros),
          10000000,
          "Stripe webhook did not deliver the sandbox credit",
        );
        assert.equal(Number((await wallet()).credit_limit_micros), 10000000);
        await pay.unroute(statusPattern);
        await pay.reload();
        await pay
          .getByText("S$10.00 added to the account.", { exact: true })
          .waitFor();
        await pay.reload();
        await pay
          .getByText("S$10.00 added to the account.", { exact: true })
          .waitFor();
        assert.equal(
          Number((await wallet()).credit_limit_micros),
          10000000,
          "Reload credited twice",
        );
        await pay.screenshot({
          path: path.join(output, "sandbox-payment.png"),
        });
        return {
          webhookVerified: true,
          creditedMicros: 10000000,
          duplicateReturnVerified: true,
          hostedCardEntry: "manual",
        };
      } finally {
        await pay.close();
      }
    },
  );
}
