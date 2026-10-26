import { test } from "node:test";
import assert from "node:assert/strict";
import { ensureFinalResponse, withFinalText } from "../lib/final-response";
test("empty final response gets evidence-based status without claiming visual success", () => {
  const result = ensureFinalResponse([
    {
      id: "a",
      role: "assistant",
      parts: [
        { type: "text", text: "" },
        {
          type: "tool-writeFileTool",
          state: "output-available",
          output: { ok: true, file: "app/game.tsx" },
        },
        {
          type: "tool-checkAppTool",
          state: "output-available",
          output: { ok: true },
        },
      ],
    },
  ] as any);
  assert.match(result.text!, /app\/game.tsx/);
  assert.match(result.text!, /appearance still need checking/);
  assert.match(result.text!, /Harness status/);
  assert.equal(ensureFinalResponse(result.messages).text, null);
});
test("ordinary text is preserved and tool failures do not become success", () => {
  assert.equal(
    ensureFinalResponse([
      { id: "a", role: "assistant", parts: [{ type: "text", text: "Done" }] },
    ]).text,
    null,
  );
  assert.match(
    ensureFinalResponse([
      {
        id: "a",
        role: "assistant",
        parts: [{ type: "tool-writeFileTool", state: "output-error" }],
      },
    ] as any).text!,
    /may be incomplete/,
  );
});
test("fallback text is inserted before finish in the streamed response", async () => {
  const source = new ReadableStream({
    start(c) {
      c.enqueue({ type: "start" });
      c.enqueue({ type: "finish" });
      c.close();
    },
  });
  const parts = [];
  const reader = withFinalText(source, () => "Harness status").getReader();
  while (true) {
    const item = await reader.read();
    if (item.done) break;
    parts.push(item.value);
  }
  assert.deepEqual(
    parts.map((p) => p.type),
    ["start", "text-start", "text-delta", "text-end", "finish"],
  );
});
test("preliminary narration followed by empty final step gets an incomplete status", () => {
  const result = ensureFinalResponse([
    {
      id: "a",
      role: "assistant",
      parts: [
        { type: "step-start" },
        { type: "text", text: "I'll read the project first." },
        {
          type: "tool-readFileTool",
          state: "output-available",
          output: { content: "source" },
        },
        { type: "step-start" },
        { type: "text", text: "" },
      ],
    },
  ] as any);
  assert.match(result.text!, /Completion was not confirmed/);
  assert.equal(ensureFinalResponse(result.messages).text, null);
});
test("interrupted run preserves completed writes even with preliminary narration", () => {
  const result = ensureFinalResponse(
    [
      {
        id: "a",
        role: "assistant",
        parts: [
          { type: "text", text: "I will build it." },
          {
            type: "tool-writeFileTool",
            state: "output-available",
            output: { ok: true, file: "app/page.tsx" },
          },
        ],
      },
    ] as any,
    true,
  );
  assert.match(result.text!, /interrupted/);
  assert.match(result.text!, /app\/page.tsx/);
  assert.match(result.text!, /may be incomplete/);
  assert.equal(result.messages.at(-1)!.parts.length, 3);
});

test("a partial write or length finish is incomplete even after visible planning text", () => {
  const partial: any = [
    {
      id: "a",
      role: "assistant",
      parts: [
        { type: "text", text: "Writing now." },
        {
          type: "tool-writeFileTool",
          state: "input-streaming",
          input: { file: "game.tsx" },
        },
      ],
    },
  ];
  const result = ensureFinalResponse(partial, false, "length");
  assert.match(result.text!, /size limit/);
  assert.match(result.text!, /not applied/);
  assert.doesNotMatch(result.text!, /Updated/);
  assert.equal(ensureFinalResponse(result.messages).text, null);
  assert.match(ensureFinalResponse(partial).text!, /tool call did not finish/);
  assert.ok(
    ensureFinalResponse(
      [
        {
          id: "a",
          role: "assistant",
          parts: [{ type: "text", text: "Long partial answer" }],
        },
      ],
      false,
      "length",
    ).text,
  );
});

test("incomplete outcomes reach the run controller before stream completion", async () => {
  const source = new ReadableStream({
    start(c) {
      c.enqueue({ type: "finish", finishReason: "stop" });
      c.close();
    },
  });
  const parts: any[] = [];
  for await (const part of withFinalText(
    source,
    () => "Harness status",
    () => "incomplete",
  ))
    parts.push(part);
  assert.equal(parts.at(-2).type, "data-run-outcome");
  assert.equal(parts.at(-2).data.status, "incomplete");
  assert.equal(parts.at(-1).type, "finish");
});

test("edit requests cannot complete through narration, inspections, old edits or failed writes", async () => {
  const { requestsProjectEdit } = await import("../lib/project-edit-request");
  const turn = (text: string): any => ({
    id: "u",
    role: "user",
    parts: [{ type: "text", text }],
  });
  for (const text of [
    "can you make the cards larger",
    "Please fix the reset button",
    "Build a scorekeeper app",
    "Add a blue background",
    "Make the cards larger without changing game logic",
  ])
    assert.equal(requestsProjectEdit([turn(text)]), true, text);
  for (const text of [
    "Why are the cards small?",
    "How can I make the cards larger?",
    "Explain the code",
    "Can you make a plan for the app?",
    "Reply with exactly READY",
    "Make the cards larger without editing files",
    "Show me an example",
  ])
    assert.equal(requestsProjectEdit([turn(text)]), false, text);
  assert.equal(
    requestsProjectEdit([turn("Make the cards larger"), turn("continue")]),
    true,
  );
  assert.equal(
    requestsProjectEdit([turn("Explain this code"), turn("continue")]),
    false,
  );
  for (const tools of [
    [],
    [
      {
        type: "tool-readFileTool",
        state: "output-available",
        output: { ok: true },
      },
    ],
    [
      {
        type: "tool-writeFileTool",
        state: "output-available",
        output: { ok: false },
      },
    ],
    [
      {
        type: "tool-replaceInFileTool",
        state: "output-available",
        output: { ok: true, replacements: 0 },
      },
    ],
  ]) {
    const result = ensureFinalResponse(
      [
        {
          id: "old",
          role: "assistant",
          parts: [
            {
              type: "tool-writeFileTool",
              state: "output-available",
              output: { ok: true },
            },
          ],
        },
        turn("Make the cards larger"),
        {
          id: "a",
          role: "assistant",
          parts: [
            ...tools,
            {
              type: "text",
              text: "I updated app/page.tsx. The cards are now larger.",
            },
          ],
        },
      ] as any,
      false,
      "stop",
      true,
    );
    assert.match(result.text!, /No successful file-editing action/);
    assert.equal(ensureFinalResponse(result.messages).text, null);
  }
  const changed = ensureFinalResponse(
    [
      {
        id: "a",
        role: "assistant",
        parts: [
          {
            type: "tool-replaceInFileTool",
            state: "output-available",
            output: { ok: true, replacements: 1 },
          },
          { type: "text", text: "Increased card size." },
        ],
      },
    ] as any,
    false,
    "stop",
    true,
  );
  assert.equal(changed.text, null);
});
