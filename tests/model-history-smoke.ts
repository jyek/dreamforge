import assert from "node:assert/strict";
import { convertToModelMessages, type UIMessage } from "ai";
import { normalizeModelHistory } from "../lib/model-history";
const history: UIMessage[] = [
  { id: "u", role: "user", parts: [{ type: "text", text: "Check my game" }] },
  {
    id: "a",
    role: "assistant",
    parts: [
      { type: "step-start" },
      { type: "text", text: "" },
      {
        type: "tool-inspect",
        toolCallId: "call-1",
        state: "output-available",
        input: { file: "app/page.tsx" },
        output: { ok: true },
      },
      { type: "step-start" },
      { type: "text", text: "  " },
    ],
  },
  {
    id: "next",
    role: "user",
    parts: [{ type: "text", text: "Are you there?" }],
  },
];
const raw = await convertToModelMessages(history);
const normalized = normalizeModelHistory(raw);
assert.ok(
  normalized.length < raw.length,
  "Empty trailing assistant turn is removed",
);
for (const message of normalized) {
  if (message.role === "assistant")
    assert.ok(
      typeof message.content === "string"
        ? message.content.trim()
        : message.content.length,
    );
}
const parts = (messages: typeof raw) =>
  messages
    .flatMap((m) => (Array.isArray(m.content) ? (m.content as any[]) : []))
    .filter((p) => p.type === "tool-call" || p.type === "tool-result");
assert.deepEqual(
  parts(normalized),
  parts(raw),
  "Tool call/result pairing is preserved",
);
assert.deepEqual(
  normalized.filter((m) => m.role === "user"),
  raw.filter((m) => m.role === "user"),
);
assert.deepEqual(
  normalizeModelHistory(normalized),
  normalized,
  "Normalization is idempotent",
);
console.log(
  "PASS: empty assistant history removed; user messages and tool call/results preserved",
);
