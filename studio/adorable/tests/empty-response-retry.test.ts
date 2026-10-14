import { test } from "node:test";
import assert from "node:assert/strict";
import { withEmptyResponseRetry } from "../lib/empty-response-retry";
const finish = (reason = "stop") => ({
  type: "finish",
  finishReason: { unified: reason },
  usage: { inputTokens: { total: 3 }, outputTokens: { total: 2 } },
});
function mock(runs: any[][]) {
  let calls = 0;
  const prompts: any[] = [];
  return {
    get calls() {
      return calls;
    },
    prompts,
    model: {
      doStream: async (options: any) => {
        prompts.push(options.prompt);
        const chunks = runs[calls++];
        return {
          stream: new ReadableStream({
            start(c) {
              chunks.forEach((p) => c.enqueue(p));
              c.close();
            },
          }),
        };
      },
    },
  } as any;
}
async function collect(model: any) {
  const r = await model.doStream({
    prompt: [{ role: "tool", content: "existing result" }],
  });
  const out: any[] = [];
  const reader = r.stream.getReader();
  while (true) {
    const p = await reader.read();
    if (p.done) return out;
    out.push(p.value);
  }
}
test("empty completion retries once, preserves tool history and adds retry token usage", async () => {
  const m = mock([
    [finish()],
    [{ type: "text-delta", delta: "Completed" }, finish()],
  ]);
  const out = await collect(withEmptyResponseRetry(m.model));
  assert.equal(m.calls, 2);
  assert.equal(m.prompts[1].at(-1).content, "existing result");
  assert.equal(out[0].delta, "Completed");
  assert.equal(out.at(-1).usage.inputTokens.total, 6);
  assert.equal(out.at(-1).usage.outputTokens.total, 4);
});
test("repeated empty output stops after one retry", async () => {
  const m = mock([[finish()], [finish()]]);
  await collect(withEmptyResponseRetry(m.model));
  assert.equal(m.calls, 2);
});
test("tool calls, errors, and truncation are never replayed", async () => {
  for (const first of [
    [{ type: "tool-call", toolCallId: "one" }, finish("tool-calls")],
    [{ type: "error", error: "failed" }, finish()],
    [finish("length")],
  ]) {
    const m = mock([first]);
    await collect(withEmptyResponseRetry(m.model));
    assert.equal(m.calls, 1);
  }
});
test("visible text streams before the provider finishes", async () => {
  let controller!: ReadableStreamDefaultController<any>;
  const model = {
    doStream: async () => ({
      stream: new ReadableStream({
        start(c) {
          controller = c;
          c.enqueue({ type: "text-start", id: "t" });
          c.enqueue({ type: "text-delta", id: "t", delta: "Working" });
        },
      }),
    }),
  } as any;
  const result = await withEmptyResponseRetry(model).doStream({
    prompt: [],
  } as any);
  const reader = result.stream.getReader();
  assert.equal((await reader.read()).value?.type, "text-start");
  assert.equal((await reader.read()).value?.type, "text-delta");
  controller.enqueue(finish());
  controller.close();
  assert.equal((await reader.read()).value?.type, "finish");
  assert.equal((await reader.read()).done, true);
});
