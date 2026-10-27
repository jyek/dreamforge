import assert from "node:assert/strict";
import { createModelRouting } from "../lib/model-routing";
import { MODELS, type ModelChoice } from "../lib/model-catalog";
async function scenario(
  choice: ModelChoice,
  quotas: number[],
  statuses = [200],
) {
  const bodies: any[] = [];
  const routing = createModelRouting(choice, "test", {
    quota: async () => ({ remaining: quotas.shift() ?? 10 }),
    request: async (_input, init) => {
      bodies.push(JSON.parse(init!.body as string));
      return new Response("{}", { status: statuses.shift() ?? 200 });
    },
  });
  const run = () =>
    routing.fetch("https://example.test", {
      method: "POST",
      body: JSON.stringify({
        model: "untrusted",
        messages: [{ role: "user", content: "hello" }],
        max_tokens: 200,
        reasoning_effort: "low",
      }),
    });
  return { routing, run, bodies };
}
for (const choice of [
  "haiku",
  "sonnet",
  "luna",
  "sol",
  "gemini-lite",
  "gemini",
  "glm",
] as const) {
  const s = await scenario(choice, []);
  await s.run();
  assert.equal(s.bodies[0].model, MODELS[choice].id);
}
console.log(
  "PASS seven explicit model choices, no automatic provider fallback",
);
