import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { tool } from "ai";
import { z } from "zod";
import { streamLlmResponse } from "../lib/llm-provider";
import { ensureFinalResponse } from "../lib/final-response";

test("explicit edits require tool action until a successful mutation; questions stay text-only", async () => {
  const previous = process.env.OPENAI_BASE_URL;
  const requests: any[] = [];
  let content = "small cards";
  let ignoreTools = false;
  let reservations = 0,
    settlements = 0;
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    requests.push(body);
    const required = body.tool_choice === "required" && !ignoreTools;
    const name = requests.length === 1 ? "readFileTool" : "writeFileTool";
    const args = name === "writeFileTool" ? { content: "large cards" } : {};
    const envelope = (delta: unknown, finish_reason: string | null) => ({
      id: `edit-${requests.length}`,
      object: "chat.completion.chunk",
      created: 1,
      model: "fixture",
      choices: [{ index: 0, delta, finish_reason }],
    });
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write(
      `data: ${JSON.stringify(envelope(required ? { role: "assistant", tool_calls: [{ index: 0, id: `call-${requests.length}`, type: "function", function: { name, arguments: JSON.stringify(args) } }] } : { role: "assistant", content: "I made the cards larger." }, null))}\n\n`,
    );
    res.end(
      `data: ${JSON.stringify({ ...envelope({}, required ? "tool_calls" : "stop"), usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\ndata: [DONE]\n\n`,
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${address.port}/v1`;
  const run = (text: string) =>
    streamLlmResponse({
      system: "Help with the project.",
      apiKey: "fixture-only",
      providerOverride: "openai",
      modelOverride: "fixture",
      maxSteps: 5,
      beforeStep: async () => {
        reservations++;
      },
      afterStep: async () => {
        settlements++;
      },
      messages: [{ id: "u", role: "user", parts: [{ type: "text", text }] }],
      tools: {
        readFileTool: tool({
          inputSchema: z.object({}),
          execute: async () => ({ ok: true, content }),
        }),
        writeFileTool: tool({
          inputSchema: z.object({ content: z.string() }),
          execute: async (input) => {
            content = input.content;
            return { ok: true };
          },
        }),
      },
    });
  try {
    const editing = await run("can you make the cards larger");
    for await (const event of editing.result.fullStream)
      assert.notEqual(event.type, "error");
    assert.equal(editing.requiresEdits, true);
    assert.equal(content, "large cards");
    assert.deepEqual(
      requests.map((r) => r.tool_choice),
      ["required", "required", "auto"],
    );
    assert.equal((await editing.result.steps).length, 3);
    assert.equal(reservations, 3);
    assert.equal(settlements, 3);
    requests.length = 0;
    const question = await run("Why are the cards small?");
    for await (const event of question.result.fullStream)
      assert.notEqual(event.type, "error");
    assert.equal(question.requiresEdits, false);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].tool_choice, "auto");
    requests.length = 0;
    ignoreTools = true;
    const ignored = await run("Make the cards larger");
    let completion: ReturnType<typeof ensureFinalResponse> | undefined;
    const stream = ignored.result.toUIMessageStream({
      onFinish: ({ messages, isAborted, finishReason }) => {
        completion = ensureFinalResponse(
          messages,
          isAborted,
          finishReason,
          ignored.requiresEdits,
        );
      },
    });
    for await (const event of stream) assert.notEqual(event.type, "error");
    assert.match(completion!.text!, /No successful file-editing action/);
    assert.equal(requests.length, 1);
  } finally {
    if (previous === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = previous;
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
