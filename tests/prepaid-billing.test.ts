import assert from "node:assert/strict";
import { test } from "node:test";
import {
  usageCreditMicros,
  reservationCreditMicros,
  availableCreditMicros,
  formatCredit,
  formatCreditBalance,
  billingRate,
  CREDIT_TOPUPS,
  BILLING_VERSION,
  USD_TO_SGD,
  MARKUP_PERCENT,
  modelCostRate,
  formatTokenRate,
} from "../lib/billing";
import { modelTier, MODELS } from "../lib/model-catalog";
import { createModelRouting } from "../lib/model-routing";
import { supportsImages } from "../lib/chat-input";
import { purchasePackages } from "../lib/topup-packages";
test("one prepaid balance has explicit versioned model prices, conservative holds and rounded micro-SGD charges", () => {
  assert.equal(usageCreditMicros(MODELS.glm.id, 1000000, 1000000), 1316250);
  assert.equal(usageCreditMicros(MODELS.sonnet.id, 1000000, 1000000), 24300000);
  assert.equal(usageCreditMicros(MODELS.sol.id, 100000, 10000), 607500);
  assert.equal(usageCreditMicros(MODELS.sol.id, 300000, 10000), 2733750);

  for (const m of Object.values(MODELS))
    assert(
      reservationCreditMicros(m.id, 2000) >=
        usageCreditMicros(m.id, 1000, 1000),
    );
  assert.throws(() => usageCreditMicros("unpriced", 1, 1));
  assert.throws(() => usageCreditMicros(MODELS.glm.id, -1, 1));
  assert.throws(() =>
    usageCreditMicros(MODELS.glm.id, 1, 1, "unknown-version"),
  );
  assert.equal(
    availableCreditMicros({
      credit_limit_micros: "10000000",
      credit_used_micros: "50000",
      credit_reserved_micros: "1000000",
    }),
    8950000,
  );
  assert.equal(formatCredit(10000000), "S$10.00");
  assert.equal(reservationCreditMicros(MODELS.sonnet.id, 22000, 2000), 141750);
  assert.equal(reservationCreditMicros(MODELS.sol.id, 302000, 2000), 3098250);
});
test("pricing proposal is inactive by default; new top-ups buy SGD rather than separate tokens", () => {
  delete process.env.DREAMFORGE_PREPAID_BILLING_ENABLED;
  assert(purchasePackages().every((p) => !p.creditPurchase));
  process.env.DREAMFORGE_PREPAID_BILLING_ENABLED = "true";
  assert.equal(purchasePackages().length, 4);
  for (const p of purchasePackages())
    assert.equal(p.creditMicros, p.amount * 10000);
  delete process.env.DREAMFORGE_PREPAID_BILLING_ENABLED;
  for (const c of ["haiku", "luna", "gemini-lite", "glm"] as const)
    assert.equal(modelTier(c), "basic");
  for (const c of ["sonnet", "sol", "gemini"] as const)
    assert.equal(modelTier(c), "advanced");
  assert.equal(supportsImages("sonnet"), true);
  assert.equal(supportsImages("sol"), true);
  assert.equal(supportsImages("gemini"), true);
});
test("Advanced models retain correct IDs, gateway caps and API-specific parameter handling", async () => {
  for (const choice of ["sonnet", "sol", "gemini"] as const) {
    let body: any;
    const r = createModelRouting(choice, "fixture", {
      quota: async () => {
        throw Error("Must not silently route via free model");
      },
      request: async (_input, init) => {
        body = JSON.parse(String(init?.body));
        return Response.json({});
      },
    });
    await r.fetch(
      "https://openrouter.ai/api/v1/" +
        (choice === "sol" ? "responses" : "chat/completions"),
      {
        method: "POST",
        body: JSON.stringify({
          ...(choice === "sol"
            ? {
                input: [],
                store: true,
                previous_response_id: "old",
                max_output_tokens: 200,
              }
            : { messages: [], max_tokens: 200 }),
          tool_choice: "required",
          temperature: 1,
          top_p: 1,
        }),
      },
    );
    assert.equal(body.model, MODELS[choice].id);
    assert.equal(body.provider.max_price.prompt, MODELS[choice].input);
    if (choice === "sol") {
      assert.equal(body.store, false);
      assert.equal(body.previous_response_id, undefined);
      assert.equal(body.max_output_tokens, 200);
      assert.equal(body.max_tokens, undefined);
    }
    if (choice === "sonnet") {
      assert.equal(body.tool_choice, "auto");
      assert.equal(body.temperature, undefined);
      assert.equal(body.top_p, undefined);
    }
  }
});

test("GPT-6.1 Sol uses Responses through the real SDK and reports the canonical priced model", async () => {
  const { streamLlmResponse } = await import("../lib/llm-provider");
  const previous = process.env.OPENAI_BASE_URL,
    previousFetch = globalThis.fetch;
  process.env.OPENAI_BASE_URL = "https://openrouter.ai/api/v1";
  const model = MODELS.sol.id;
  let requestBody: any;
  let path = "";
  let settledModel = "";
  const message = {
    id: "msg_fixture",
    type: "message",
    role: "assistant",
    status: "completed",
    content: [{ type: "output_text", text: "Hello", annotations: [] }],
  };
  const response = {
    id: "resp_fixture",
    object: "response",
    created_at: 1,
    model,
    status: "completed",
    output: [message],
    usage: {
      input_tokens: 10,
      output_tokens: 2,
      total_tokens: 12,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
  };
  try {
    globalThis.fetch = async (input, init) => {
      path = String(input);
      requestBody = JSON.parse(String(init?.body));
      const chunks = [
        {
          type: "response.created",
          response: { ...response, status: "in_progress", output: [] },
        },
        {
          type: "response.output_item.added",
          output_index: 0,
          item: { ...message, status: "in_progress", content: [] },
        },
        {
          type: "response.content_part.added",
          item_id: message.id,
          output_index: 0,
          content_index: 0,
          part: { type: "output_text", text: "", annotations: [] },
        },
        {
          type: "response.output_text.delta",
          item_id: message.id,
          output_index: 0,
          content_index: 0,
          delta: "Hello",
        },
        {
          type: "response.output_text.done",
          item_id: message.id,
          output_index: 0,
          content_index: 0,
          text: "Hello",
        },
        { type: "response.output_item.done", output_index: 0, item: message },
        { type: "response.completed", response },
      ];
      return new Response(
        chunks
          .map(
            (c, i) =>
              `event: ${c.type}\ndata: ${JSON.stringify({ ...c, sequence_number: i })}\n\n`,
          )
          .join(""),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    };
    const { result } = await streamLlmResponse({
      system: "Be brief",
      messages: [
        { id: "u1", role: "user", parts: [{ type: "text", text: "Hello" }] },
      ],
      tools: {},
      apiKey: "fixture",
      providerOverride: "openai",
      modelChoice: "sol",
      modelOverride: model,
      afterStep: async (u) => {
        settledModel = u.modelId || "";
      },
    });
    assert.equal(await result.text, "Hello");
    assert.equal(path, "https://openrouter.ai/api/v1/responses");
    assert.equal(requestBody.model, model);
    assert.equal(requestBody.store, false);
    assert.equal(settledModel, model);
  } finally {
    globalThis.fetch = previousFetch;
    if (previous === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = previous;
  }
});

test("published customer rates are cost x SGD conversion x 1.5, including cache rates", () => {
  assert.equal(MARKUP_PERCENT, 50);
  assert.equal(USD_TO_SGD, 1.35);
  for (const m of Object.values(MODELS))
    for (const input of [1000, 300000]) {
      const cost = modelCostRate(m.id, input),
        price = billingRate(m.id, input);
      assert(Math.abs(price.input - cost.input * USD_TO_SGD * 1.5) < 1e-10);
      assert(Math.abs(price.output - cost.output * USD_TO_SGD * 1.5) < 1e-10);
    }
  assert.equal(
    formatTokenRate(billingRate(MODELS.glm.id).input),
    "S$0.00000030375",
  );
  assert.equal(
    usageCreditMicros(MODELS.sonnet.id, 1000, 50, BILLING_VERSION, {
      cacheReadTokens: 900,
    }),
    1600,
  );
  assert.throws(
    () =>
      usageCreditMicros(MODELS.glm.id, 1, 1, BILLING_VERSION, {
        cacheReadTokens: 2,
      }),
    /Invalid token usage/,
  );
  assert.deepEqual(
    CREDIT_TOPUPS.map((p) => p.amount),
    [1000, 2500, 5000, 10000],
  );
});

test("remaining credit uses two decimals without changing charge precision", () => {
  assert.equal(formatCreditBalance(23452500), "S$23.45");
  assert.equal(formatCreditBalance(0), "S$0.00");
  assert.equal(formatCredit(1234), "S$0.0012");
});

test("local Stripe session metadata is ignored by production and bound to its local origin", async () => {
  const { paymentChildId, paidTokenPackage } =
    await import("../lib/payment-credit");
  const keys = [
    "NODE_ENV",
    "DATABASE_URL",
    "DREAMFORGE_LOCAL_DATABASE",
    "DREAMFORGE_SITE_URL",
  ];
  const before = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const local = {
    id: "cs_test_localmetadata",
    livemode: false,
    payment_status: "paid",
    mode: "payment",
    currency: "sgd",
    amount_total: 1000,
    metadata: {
      package: "credit-10-v1",
      local_child_id: "00000000-0000-4000-8000-000000000095",
      local_origin: "http://localhost:3000",
    },
  };
  try {
    Object.assign(process.env, {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://local@127.0.0.1/local",
      DREAMFORGE_LOCAL_DATABASE: "true",
      DREAMFORGE_SITE_URL: "http://localhost:3000",
    });
    assert.equal(paymentChildId(local), undefined);
    assert.equal(paidTokenPackage(local), null);
    Object.assign(process.env, { NODE_ENV: "development" });
    assert.equal(paymentChildId(local), local.metadata.local_child_id);
    assert(paidTokenPackage(local));
    assert.equal(
      paymentChildId({
        ...local,
        metadata: { ...local.metadata, local_origin: "http://other.local" },
      }),
      undefined,
    );
    assert.equal(
      paymentChildId({
        ...local,
        metadata: {
          package: "credit-10-v1",
          child_id: local.metadata.local_child_id,
        },
      }),
      undefined,
    );
  } finally {
    for (const k of keys) {
      if (before[k] === undefined) Reflect.deleteProperty(process.env, k);
      else process.env[k] = before[k];
    }
  }
});

test("legacy sidebar credit equivalent matches conversion without granting or changing a wallet", async () => {
  const { legacyCreditEquivalentMicros, formatCreditBalance } =
    await import("../lib/billing");
  assert.equal(
    formatCreditBalance(legacyCreditEquivalentMicros(6127031)),
    "S$30.64",
  );
  assert.equal(legacyCreditEquivalentMicros(0), 0);
  assert.equal(legacyCreditEquivalentMicros(-50), 0);
});
