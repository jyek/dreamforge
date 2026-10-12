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
let s = await scenario("auto", [10]);
await s.run();
assert.equal(s.bodies[0].model, MODELS.free.id);
s = await scenario("auto", [0]);
await s.run();
assert.equal(s.bodies[0].model, MODELS.qwen.id);
assert.equal(s.bodies[0].provider.max_price.prompt, 0.07);
assert.equal(s.bodies[0].reasoning_effort, undefined);
s = await scenario("free", [0]);
await assert.rejects(s.run, /daily free quota/);
assert.equal(s.bodies.length, 0);
s = await scenario("auto", [10, 0], [429, 200]);
await s.run();
assert.deepEqual(
  s.bodies.map((b) => b.model),
  [MODELS.free.id, MODELS.qwen.id],
);
s = await scenario("auto", [10, 10], [429]);
assert.equal((await s.run()).status, 429);
assert.equal(s.bodies.length, 1);
s = await scenario("glm", []);
await s.run();
assert.equal(s.bodies[0].model, MODELS.glm.id);
s = await scenario("qwen", []);
for (let i = 0; i < 20; i++) await s.run();
assert.equal(s.bodies.length, 20);
assert.ok(s.bodies.every((b) => b.model === MODELS.qwen.id));
console.log(
  "PASS: free-first routing, quota fallback, congestion, free-only, manual selection and repeated paid requests without a budget gate",
);
