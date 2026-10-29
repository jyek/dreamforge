import { test } from "node:test";
import assert from "node:assert/strict";
import { createModelRouting } from "../lib/model-routing";
test("Gemini and GLM use low reasoning effort", async () => {
  for (const choice of ["gemini", "glm"] as const) {
    let body: any;
    const router = createModelRouting(choice, "test", {
      request: async (_input, init) => {
        body = JSON.parse(init!.body as string);
        return new Response("{}", { status: 200 });
      },
    });
    await router.fetch("https://example.test", {
      body: JSON.stringify({
        messages: [],
        reasoning_effort: "low",
        max_tokens: 8192,
      }),
    });
    assert.equal(body.reasoning_effort, undefined);
    assert.deepEqual(
      body.reasoning,
      choice === "gemini"
        ? { effort: "low", exclude: true }
        : { effort: "low", exclude: true },
    );
    assert.ok(body.provider.require_parameters);
  }
});
test("explicit model choices never depend on free quota", async () => {
  for (const choice of ["haiku", "glm"] as const) {
    let body: any;
    const router = createModelRouting(choice, "test", {
      quota: async () => {
        throw Error("Unexpected quota check");
      },
      request: async (_input, init) => {
        body = JSON.parse(String(init?.body));
        return Response.json({});
      },
    });
    await router.fetch("https://example.test", {
      body: JSON.stringify({ messages: [] }),
    });
    assert.equal(
      body.model,
      choice === "haiku" ? "anthropic/claude-haiku-5.5" : "z-ai/glm-5.3-flash",
    );
  }
});
