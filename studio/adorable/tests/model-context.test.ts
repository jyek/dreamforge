import { test } from "node:test";
import assert from "node:assert/strict";
import type { ModelMessage } from "ai";
import { compactPastToolHistory } from "../lib/model-history";
import { usageReservationBound } from "../lib/platform-usage";
test("prior tool payloads are omitted while all intent and current tool pairs survive", () => {
  const messages: ModelMessage[] = [
    { role: "user", content: "Build a game" },
    {
      role: "assistant",
      content: [
        { type: "text", text: "I changed the score." },
        {
          type: "tool-call",
          toolCallId: "old",
          toolName: "readFile",
          input: { file: "app/page.tsx" },
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "old",
          toolName: "readFile",
          output: { type: "text", value: "x".repeat(130000) },
        },
      ],
    },
    {
      role: "user",
      content: "Align the players and apply discounts before spending gems",
    },
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: "current",
          toolName: "readFile",
          input: { file: "app/page.tsx" },
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "current",
          toolName: "readFile",
          output: { type: "text", value: "current source" },
        },
      ],
    },
  ];
  const compact = compactPastToolHistory(messages);
  assert.equal(compact.length, 5);
  assert.deepEqual(compact.slice(-3), messages.slice(-3));
  assert.equal(compact[0], messages[0]);
  assert.deepEqual(compact[1], {
    role: "assistant",
    content: [{ type: "text", text: "I changed the score." }],
  });
  assert(usageReservationBound(messages, "system", 4096) > 88000);
  assert(usageReservationBound(compact, "system", 4096) < 88000);
  assert.equal(messages.length, 6);
});
test("all history is retained when no new user turn exists", () => {
  const messages: ModelMessage[] = [{ role: "assistant", content: "Status" }];
  assert.equal(compactPastToolHistory(messages), messages);
});
