import { test } from "node:test";
import assert from "node:assert/strict";
import { safeProgressStream } from "../lib/safe-progress-stream";
test("status streams immediately and text waits for screening without waiting for whole run", async () => {
  let input!: ReadableStreamDefaultController<unknown>;
  let screenDone!: () => void;
  const source = new ReadableStream<any>({
    start(c) {
      input = c;
    },
  });
  const screened = new Promise<void>((resolve) => (screenDone = resolve));
  const reader = safeProgressStream(
    source,
    () => screened,
    (value) => value,
  ).getReader() as ReadableStreamDefaultReader<any>;
  assert.equal((await reader.read()).value.type, "data-progress");
  input.enqueue({ type: "start" });
  assert.equal((await reader.read()).value.type, "start");
  input.enqueue({ type: "text-start", id: "a" });
  input.enqueue({ type: "text-delta", id: "a", delta: "Safe progress" });
  input.enqueue({ type: "text-end", id: "a" });
  let delivered = false;
  const next = reader.read().then((item) => {
    delivered = true;
    return item;
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(delivered, false);
  screenDone();
  assert.equal((await next).value.type, "text-start");
  assert.equal((await reader.read()).value.delta, "Safe progress");
  assert.equal((await reader.read()).value.type, "text-end");
  input.enqueue({ type: "finish" });
  input.close();
  while (!(await reader.read()).done) {}
});
test("unsafe text, raw tool arguments and reasoning never reach the user", async () => {
  const source = new ReadableStream({
    start(c) {
      for (const part of [
        { type: "reasoning-delta", delta: "private" },
        { type: "tool-input-delta", inputTextDelta: "secret" },
        { type: "text-start", id: "a" },
        { type: "text-delta", id: "a", delta: "blocked" },
        { type: "text-end", id: "a" },
      ])
        c.enqueue(part);
      c.close();
    },
  });
  const reader = safeProgressStream(
    source,
    async () => {
      throw Error("blocked");
    },
    (v) => v,
  ).getReader();
  const chunks = [];
  while (true) {
    const item = await reader.read();
    if (item.done) break;
    chunks.push(item.value);
  }
  assert.ok(chunks.some((c: any) => c.type === "error"));
  assert.ok(!JSON.stringify(chunks).includes("private"));
  assert.ok(!chunks.some((c: any) => c.type === "text-delta"));
});
test("provider timeout abort clears progress and ends with a visible error", async () => {
  const source = new ReadableStream({
    start(c) {
      c.enqueue({ type: "abort" });
      c.close();
    },
  });
  const reader = safeProgressStream(
    source,
    async () => {},
    (v) => v,
  ).getReader();
  const chunks: any[] = [];
  while (true) {
    const item = await reader.read();
    if (item.done) break;
    chunks.push(item.value);
  }
  assert.ok(
    chunks.some((c) => c.type === "data-progress" && c.data.message === ""),
  );
  assert.equal(chunks.at(-1).type, "error");
});
test("quota explanation survives screening instead of becoming a generic failure", async () => {
  const { CREDIT_LIMIT_MESSAGE: message } =
    await import("../lib/trusted-errors");
  const source = new ReadableStream({
    start(c) {
      c.enqueue({ type: "error", errorText: message });
      c.close();
    },
  });
  const reader = safeProgressStream(
    source,
    async () => {},
    (v) => v,
  ).getReader();
  const parts: any[] = [];
  while (true) {
    const p = await reader.read();
    if (p.done) break;
    parts.push(p.value);
  }
  assert.equal(parts.at(-1).errorText, message);
});
test("invalid tool arguments pass through redaction and moderation before delivery", async () => {
  const source = new ReadableStream({
    start(c) {
      c.enqueue({
        type: "tool-input-error",
        toolCallId: "bad",
        toolName: "readFileTool",
        input: { file: "private@example.com" },
        errorText: "Invalid file",
      });
      c.close();
    },
  });
  let screened = "";
  const reader = safeProgressStream(
    source,
    async (text) => {
      screened = text;
      throw Error("blocked");
    },
    (value) =>
      JSON.parse(
        JSON.stringify(value).replaceAll(
          "private@example.com",
          "[private email]",
        ),
      ),
  ).getReader();
  const parts: any[] = [];
  while (true) {
    const item = await reader.read();
    if (item.done) break;
    parts.push(item.value);
  }
  assert.ok(screened.includes("[private email]"));
  assert.ok(!screened.includes("private@example.com"));
  assert.ok(!parts.some((p) => p.type === "tool-input-error"));
  assert.equal(parts.at(-1).type, "error");
});

test("screened sentence batches stream before text-end and keep unfinished text private", async () => {
  let input!: ReadableStreamDefaultController<unknown>;
  const source = new ReadableStream<unknown>({
    start(c) {
      input = c;
    },
  });
  const screened: string[] = [];
  const reader = safeProgressStream(
    source,
    async (text) => {
      screened.push(text);
    },
    (v) => v,
  ).getReader() as ReadableStreamDefaultReader<any>;
  await reader.read();
  const sentence =
    "This is a useful explanation of the scorekeeper, describing how each click adds one point and how Reset brings the score back to zero so you can try another experiment and compare what happened with your prediction before making another change. ";
  input.enqueue({ type: "text-start", id: "streamed" });
  input.enqueue({
    type: "text-delta",
    id: "streamed",
    delta: sentence + "Unfinished secret",
  });
  assert.equal((await reader.read()).value.type, "text-start");
  assert.equal((await reader.read()).value.delta, sentence);
  assert.deepEqual(screened, [sentence]);
  input.enqueue({
    type: "text-delta",
    id: "streamed",
    delta: " stays buffered.",
  });
  input.enqueue({ type: "text-end", id: "streamed" });
  assert.equal(
    (await reader.read()).value.delta,
    "Unfinished secret stays buffered.",
  );
  assert.equal((await reader.read()).value.type, "text-end");
  assert.equal(screened.at(-1), sentence + "Unfinished secret stays buffered.");
  input.close();
  while (!(await reader.read()).done) {}
});

test("a blocked later segment never streams and ends with a visible error", async () => {
  const sentence =
    "A safe sentence about a scorekeeper that explains the experiment in enough detail to give the learner a useful first part of the answer while the rest is still being generated, without waiting for every remaining sentence to finish before it appears. ";
  const source = new ReadableStream<unknown>({
    start(c) {
      c.enqueue({ type: "text-start", id: "a" });
      c.enqueue({ type: "text-delta", id: "a", delta: sentence });
      c.enqueue({ type: "text-delta", id: "a", delta: "BLOCKED" });
      c.enqueue({ type: "text-end", id: "a" });
      c.close();
    },
  });
  const reader = safeProgressStream(
    source,
    async (text) => {
      if (text.includes("BLOCKED")) throw Error("blocked");
    },
    (v) => v,
  ).getReader();
  const chunks: any[] = [];
  while (true) {
    const p = await reader.read();
    if (p.done) break;
    chunks.push(p.value);
  }
  assert.equal(
    chunks
      .filter((c) => c.type === "text-delta")
      .map((c) => c.delta)
      .join(""),
    sentence,
  );
  assert.equal(chunks.at(-1).type, "error");
});

test("trusted quota errors survive the stream and arbitrary provider text stays private", async () => {
  const { CREDIT_LIMIT_MESSAGE } = await import("../lib/trusted-errors");
  for (const message of [CREDIT_LIMIT_MESSAGE, "untrusted provider secret"]) {
    const source = new ReadableStream({
      start(c) {
        c.enqueue({ type: "error", errorText: message });
        c.close();
      },
    });
    const reader = safeProgressStream(
      source,
      async () => {},
      (v) => v,
    ).getReader();
    const chunks: any[] = [];
    while (true) {
      const p = await reader.read();
      if (p.done) break;
      chunks.push(p.value);
    }
    assert.equal(
      chunks.at(-1).errorText,
      message === CREDIT_LIMIT_MESSAGE
        ? message
        : "This request could not finish. Please try again.",
    );
  }
});
test("trusted moderation errors thrown while screening remain actionable", async () => {
  const { MODERATION_RETRY_MESSAGE } = await import("../lib/trusted-errors");
  const source = new ReadableStream({
    start(c) {
      c.enqueue({ type: "text-start", id: "a" });
      c.enqueue({ type: "text-delta", id: "a", delta: "Hello" });
      c.enqueue({ type: "text-end", id: "a" });
      c.close();
    },
  });
  const reader = safeProgressStream(
    source,
    async () => {
      throw Error(MODERATION_RETRY_MESSAGE);
    },
    (v) => v,
  ).getReader();
  const chunks: any[] = [];
  while (true) {
    const p = await reader.read();
    if (p.done) break;
    chunks.push(p.value);
  }
  assert.equal(chunks.at(-1).errorText, MODERATION_RETRY_MESSAGE);
  assert(!chunks.some((p) => p.type === "text-delta"));
});
