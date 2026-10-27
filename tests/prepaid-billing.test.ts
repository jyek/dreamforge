import assert from "node:assert/strict";
import { test } from "node:test";
import {
  usageCreditMicros,
  reservationCreditMicros,
  availableCreditMicros,
  formatCredit,
  billingRate,
  CREDIT_TOPUPS,
} from "../lib/billing";
import { modelTier, MODELS } from "../lib/model-catalog";
import { createModelRouting } from "../lib/model-routing";
import { supportsImages } from "../lib/chat-input";
import { purchasePackages } from "../lib/topup-packages";
test("one prepaid balance has explicit versioned model prices, conservative holds and rounded micro-SGD charges", () => {
  assert.equal(usageCreditMicros(MODELS.glm.id, 1000000, 1000000), 3250000);
  assert.equal(usageCreditMicros(MODELS.sonnet.id, 1000000, 1000000), 60000000);
  assert.equal(usageCreditMicros(MODELS.sol.id, 100000, 10000), 1500000);
  assert.equal(usageCreditMicros(MODELS.sol.id, 300000, 10000), 6750000);
  assert.equal(usageCreditMicros(MODELS.free.id, 1, 1), 2);
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
  assert.equal(reservationCreditMicros(MODELS.sonnet.id, 22000, 2000), 300000);
  assert.equal(reservationCreditMicros(MODELS.sol.id, 302000, 2000), 6150000);
});
test("pricing proposal is inactive by default; new top-ups buy SGD rather than separate tokens", () => {
  delete process.env.DREAMFORGE_PREPAID_BILLING_ENABLED;
  assert(purchasePackages().every((p) => !p.creditPurchase));
  process.env.DREAMFORGE_PREPAID_BILLING_ENABLED = "true";
  assert.equal(purchasePackages().length, 4);
  for (const p of purchasePackages())
    assert.equal(p.creditMicros, p.amount * 10000);
  delete process.env.DREAMFORGE_PREPAID_BILLING_ENABLED;
  for (const c of ["auto", "free", "glm", "deepseek"] as const)
    assert.equal(modelTier(c), "basic");
  for (const c of ["sonnet", "sol", "glm-advanced"] as const)
    assert.equal(modelTier(c), "advanced");
  assert.equal(supportsImages("sonnet"), true);
  assert.equal(supportsImages("sol"), true);
  assert.equal(supportsImages("glm-advanced"), false);
});
test("Advanced models retain correct IDs, gateway caps and API-specific parameter handling", async () => {
  for (const choice of ["sonnet", "sol", "glm-advanced"] as const) {
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
