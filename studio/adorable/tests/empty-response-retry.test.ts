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

test("truncated arguments recover once without leaking or replaying the discarded tool", async () => {
  const m = mock([
    [
      { type: "text-delta", id: "t", delta: "Writing now." },
      { type: "tool-input-start", id: "discarded", toolName: "write" },
      {
        type: "tool-input-delta",
        id: "discarded",
        delta: '{"content":"unfinished',
      },
      finish("length"),
    ],
    [
      { type: "tool-input-start", id: "small", toolName: "write" },
      { type: "tool-input-delta", id: "small", delta: '{"content":"small"}' },
      { type: "tool-input-end", id: "small" },
      {
        type: "tool-call",
        toolCallId: "small",
        toolName: "write",
        input: '{"content":"small"}',
      },
      finish("tool-calls"),
    ],
  ]);
  const out = await collect(withEmptyResponseRetry(m.model));
  assert.equal(m.calls, 2);
  assert(!out.some((p) => p.id === "discarded"));
  assert.equal(out.filter((p) => p.type === "tool-call").length, 1);
  assert.match(m.prompts[1][0].content, /NOT executed/);
  assert.equal(out.at(-1).usage.outputTokens.total, 4);
});

test("a completed tool call prevents replay even if a second tool is truncated", async () => {
  const m = mock([
    [
      { type: "tool-call", toolCallId: "executed" },
      { type: "tool-input-start", id: "unfinished", toolName: "write" },
      finish("length"),
    ],
  ]);
  await collect(withEmptyResponseRetry(m.model));
  assert.equal(m.calls, 1);
});

test("recovery respects a rejected reservation and a stopped run", async () => {
  for (const cancel of [false, true]) {
    const m = mock([
      [
        { type: "tool-input-start", id: "one", toolName: "write" },
        finish("length"),
      ],
    ]);
    const controller = new AbortController();
    const r = await withEmptyResponseRetry(m.model, async () => {
      if (cancel) controller.abort();
      else throw Error("Insufficient balance");
    }).doStream({ prompt: [], abortSignal: controller.signal } as any);
    await assert.rejects(async () => {
      const reader = r.stream.getReader();
      while (!(await reader.read()).done) {}
    });
    assert.equal(m.calls, 1);
  }
});

test("settled retry usage is not charged again with the recovered step", async () => {
  const m = mock([
    [finish()],
    [{ type: "text-delta", delta: "Done" }, finish()],
  ]);
  let settlements = 0;
  const out = await collect(
    withEmptyResponseRetry(m.model, async ({ usage }) => {
      assert.equal((usage as any).outputTokens.total, 2);
      settlements++;
      return true;
    }),
  );
  assert.equal(settlements, 1);
  assert.equal(out.at(-1).usage.outputTokens.total, 2);
});

test("the recovery budget is shared across model steps in one run", async () => {
  const m = mock([
    [finish()],
    [{ type: "text-delta", delta: "Recovered" }, finish()],
    [finish()],
  ]);
  const wrapped = withEmptyResponseRetry(m.model);
  await collect(wrapped);
  await collect(wrapped);
  assert.equal(m.calls, 3, "A later step must not start another recovery");
});
