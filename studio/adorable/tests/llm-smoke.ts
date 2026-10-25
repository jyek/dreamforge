import { safeProgressStream } from "../lib/safe-progress-stream";
import { ensureFinalResponse, withFinalText } from "../lib/final-response";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { tool } from "ai";
import { z } from "zod";
import { streamLlmResponse } from "../lib/llm-provider";

// Deterministic provider smoke test: tools continue until the harness explicitly
// reserves its final step for text. No remote model calls or credentials needed.
async function main() {
  let calls: Record<string, unknown>[] = [];
  let emptyFinal = false;
  let crashFinal = false;
  let truncateTool = false;
  let truncateAlways = false;
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    calls.push(body);
    const answer =
      body.tool_choice === "none" || (truncateTool && calls.length >= 3);
    if (crashFinal && answer) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ error: { message: "Simulated provider failure" } }),
      );
      return;
    }
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    const envelope = (delta: unknown, finish_reason: string | null) => ({
      id: `smoke-${calls.length}`,
      object: "chat.completion.chunk",
      created: 1,
      model: "smoke",
      choices: [{ index: 0, delta, finish_reason }],
    });
    if (truncateTool && (calls.length === 1 || truncateAlways)) {
      res.write(
        `data: ${JSON.stringify(envelope({ role: "assistant", content: "Writing now.", tool_calls: [{ index: 0, id: `cut-${calls.length}`, type: "function", function: { name: "inspect", arguments: '{"unfinished":' } }] }, null))}\n\n`,
      );
      res.write(
        `data: ${JSON.stringify({ ...envelope({}, "length"), usage: { prompt_tokens: 3, completion_tokens: 8, total_tokens: 11 } })}\n\n`,
      );
      res.end("data: [DONE]\n\n");
      return;
    }
    res.write(
      `data: ${JSON.stringify(
        envelope(
          answer
            ? {
                role: "assistant",
                content: emptyFinal ? "" : "SMOKE_FINAL_ANSWER",
              }
            : {
                role: "assistant",
                tool_calls: [
                  {
                    index: 0,
                    id: `call-${calls.length}`,
                    type: "function",
                    function: { name: "inspect", arguments: "{}" },
                  },
                ],
              },
          null,
        ),
      )}\n\n`,
    );
    res.write(
      `data: ${JSON.stringify({ ...envelope({}, answer ? "stop" : "tool_calls"), usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`,
    );
    res.end("data: [DONE]\n\n");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${address.port}/v1`;
  process.env.LLM_MODEL = "smoke";
  try {
    for (const maxSteps of [7, 5]) {
      calls = [];
      let executions = 0,
        reservations = 0,
        settlements = 0;
      const { result } = await streamLlmResponse({
        system: "Use tools until told to answer.",
        apiKey: "local-smoke-only",
        maxSteps,
        messages: [
          {
            id: "smoke",
            role: "user",
            parts: [{ type: "text", text: "Inspect then summarize." }],
          },
        ],
        tools: {
          inspect: tool({
            inputSchema: z.object({}),
            execute: async () => {
              executions++;
              return { ok: true };
            },
          }),
        },
        beforeStep: async () => {
          reservations++;
        },
        afterStep: async () => {
          settlements++;
        },
      });
      const errors: unknown[] = [];
      for await (const event of result.fullStream)
        if (event.type === "error") errors.push(event.error);
      assert.deepEqual(errors, []);
      assert.equal(await result.text, "SMOKE_FINAL_ANSWER");
      assert.equal(calls.length, maxSteps);
      assert.equal(executions, maxSteps - 1);
      assert.equal(calls.at(-1)?.tool_choice, "none");
      assert.equal(reservations, maxSteps);
      assert.equal(settlements, maxSteps);
      console.log(
        `PASS ${maxSteps} steps: tool results followed by visible answer; accounting hooks preserved`,
      );
    }
    let fatal = false,
      formattedErrors = 0;
    let recoveredMessages: any[] = [];
    const recovered = await streamLlmResponse({
      system: "Inspect then answer.",
      apiKey: "local-test",
      maxSteps: 2,
      messages: [
        {
          id: "recovered",
          role: "user",
          parts: [{ type: "text", text: "Inspect then summarize." }],
        },
      ],
      tools: {
        inspect: tool({
          inputSchema: z.object({}),
          execute: async (): Promise<{ ok: boolean }> => {
            throw Error("Recoverable file read failure");
          },
        }),
      },
      onStreamError: async () => {
        fatal = true;
      },
    });
    const recoveredReader = recovered.result
      .toUIMessageStream({
        onError: () => {
          formattedErrors++;
          return "Tool failed";
        },
        onFinish: ({ messages, isAborted }) => {
          recoveredMessages = ensureFinalResponse(
            messages,
            fatal || isAborted,
          ).messages;
        },
      })
      .getReader();
    while (!(await recoveredReader.read()).done) {}
    assert.equal(formattedErrors, 1);
    assert.equal(
      fatal,
      false,
      "Tool errors must not mark the provider stream as failed",
    );
    assert.ok(
      recoveredMessages
        .at(-1)
        .parts.some(
          (p: any) => p.type === "text" && p.text === "SMOKE_FINAL_ANSWER",
        ),
    );
    assert.ok(
      !recoveredMessages
        .at(-1)
        .parts.some(
          (p: any) => p.type === "text" && p.text.includes("Harness status"),
        ),
    );
    console.log(
      "PASS recoverable tool error preserves the final reply without a false interrupted status",
    );
    emptyFinal = true;
    const { result } = await streamLlmResponse({
      system: "Inspect then answer.",
      apiKey: "local-test",
      maxSteps: 2,
      messages: [
        {
          id: "empty",
          role: "user",
          parts: [{ type: "text", text: "Inspect then answer." }],
        },
      ],
      tools: {
        inspect: tool({
          inputSchema: z.object({}),
          execute: async () => ({ ok: true }),
        }),
      },
    });
    let fallback: string | null = null;
    let saved: any[] = [];
    const stream = result.toUIMessageStream({
      onFinish: ({ messages }) => {
        const completion = ensureFinalResponse(messages);
        fallback = completion.text;
        saved = completion.messages;
      },
    });
    const events: any[] = [];
    const finalReader = withFinalText(stream, () => fallback).getReader();
    while (true) {
      const item = await finalReader.read();
      if (item.done) break;
      events.push(item.value);
    }
    assert.ok(
      saved
        .at(-1)
        .parts.some(
          (part: any) =>
            part.type === "text" && part.text.includes("Harness status"),
        ),
    );
    assert.ok(
      events.some(
        (event) =>
          event.type === "text-delta" && event.delta.includes("Harness status"),
      ),
    );
    assert.equal(events.at(-1).type, "finish");
    console.log(
      "PASS empty provider completion receives a visible and persisted harness status",
    );
    emptyFinal = false;
    crashFinal = true;
    let interrupted = false;
    fallback = null;
    saved = [];
    const failed = await streamLlmResponse({
      system: "Inspect then answer.",
      apiKey: "local-test",
      maxSteps: 2,
      messages: [
        {
          id: "failure",
          role: "user",
          parts: [{ type: "text", text: "Inspect then answer." }],
        },
      ],
      tools: {
        inspect: tool({
          inputSchema: z.object({}),
          execute: async () => ({ ok: true }),
        }),
      },
    });
    const failedStream = failed.result.toUIMessageStream({
      onError: () => {
        interrupted = true;
        return "Provider failed";
      },
      onFinish: ({ messages, isAborted }) => {
        const completion = ensureFinalResponse(
          messages,
          interrupted || isAborted,
        );
        fallback = completion.text;
        saved = completion.messages;
      },
    });
    const failureReader = safeProgressStream(
      withFinalText(failedStream, () => fallback),
      async () => {},
      (v) => v,
    ).getReader();
    const failureEvents: any[] = [];
    while (true) {
      const item = await failureReader.read();
      if (item.done) break;
      failureEvents.push(item.value);
    }
    assert.ok(
      saved
        .at(-1)
        .parts.some(
          (p: any) =>
            p.type === "tool-inspect" && p.state === "output-available",
        ),
      "Completed tool result must survive provider failure",
    );
    assert.ok(
      failureEvents.some(
        (e) => e.type === "text-delta" && e.delta.includes("interrupted"),
      ),
      "Interruption status must reach the browser",
    );
    assert.ok(failureEvents.some((e) => e.type === "error"));
    console.log(
      "PASS later provider failure preserves completed tools and streams an interruption status",
    );

    crashFinal = false;
    truncateTool = true;
    calls = [];
    let executed = 0,
      reserved = 0,
      settled = 0;
    const recoveredTool = await streamLlmResponse({
      system: "Build using small steps.",
      apiKey: "local-test",
      maxSteps: 3,
      messages: [
        {
          id: "truncated",
          role: "user",
          parts: [{ type: "text", text: "Build a game." }],
        },
      ],
      tools: {
        inspect: tool({
          inputSchema: z.object({}),
          execute: async () => {
            executed++;
            return { ok: true };
          },
        }),
      },
      beforeStep: async () => {
        reserved++;
      },
      afterStep: async () => {
        settled++;
      },
    });
    let recoveredFinal: any[] = [];
    const reader = recoveredTool.result
      .toUIMessageStream({
        onFinish: ({ messages }) => {
          recoveredFinal = messages;
        },
      })
      .getReader();
    while (!(await reader.read()).done) {}
    assert.equal(await recoveredTool.result.finishReason, "stop");
    assert.equal(calls.length, 3);
    assert.equal(executed, 1);
    assert.equal(reserved, 3);
    assert.equal(settled, 3);
    assert(
      !recoveredFinal
        .at(-1)
        .parts.some((p: any) => p.state === "input-streaming"),
    );
    console.log(
      "PASS actual SDK recovers truncated JSON once, executes only complete tools and accounts every provider call",
    );
    truncateAlways = true;
    calls = [];
    executed = 0;
    const exhausted = await streamLlmResponse({
      system: "Build.",
      apiKey: "local-test",
      maxSteps: 3,
      messages: [
        {
          id: "exhausted",
          role: "user",
          parts: [{ type: "text", text: "Build." }],
        },
      ],
      tools: {
        inspect: tool({
          inputSchema: z.object({}),
          execute: async () => {
            executed++;
            return { ok: true };
          },
        }),
      },
    });
    let status: string | null = null;
    const exhaustedReader = exhausted.result
      .toUIMessageStream({
        onFinish: ({ messages, isAborted, finishReason }) => {
          status = ensureFinalResponse(messages, isAborted, finishReason).text;
        },
      })
      .getReader();
    while (!(await exhaustedReader.read()).done) {}
    assert.equal(calls.length, 2);
    assert.equal(executed, 0);
    assert.match(status!, /size limit/);
    console.log(
      "PASS persistent truncation stops after one recovery with an explicit incomplete status",
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
