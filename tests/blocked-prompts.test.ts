import { test } from "node:test";
import assert from "node:assert/strict";
import type { UIMessage } from "ai";
import {
  BLOCKED_PLACEHOLDER,
  flagBlockedPrompt,
  flagHeldPrompt,
  isHeldPrompt,
  isBlockedPrompt,
  maskBlockedPrompts,
} from "../lib/blocked-prompts";
import { moderationConversation } from "../lib/moderation-decision";
const typed = {
  id: "1",
  role: "user",
  parts: [
    { type: "text", text: "something inappropriate" },
    { type: "file", mediaType: "image/png", url: "data:image/png;base64,AAAA" },
  ],
} as UIMessage;
test("a blocked prompt keeps the student's words, drops images and is flagged", () => {
  const flagged = flagBlockedPrompt(typed);
  assert.ok(isBlockedPrompt(flagged));
  assert.deepEqual(flagged.parts, [
    { type: "text", text: "something inappropriate" },
  ]);
  assert.ok(!isBlockedPrompt(typed));
});
test("blocked wording never reaches the model or the safety check", () => {
  const flagged = flagBlockedPrompt(typed);
  const masked = maskBlockedPrompts([flagged, { ...typed, id: "2" }]);
  assert.deepEqual(masked[0].parts, [
    { type: "text", text: BLOCKED_PLACEHOLDER },
  ]);
  assert.equal(masked[1].parts.length, 2);
  const moderated = moderationConversation([flagged]);
  assert.ok(!moderated.includes("inappropriate"));
  assert.ok(moderated.includes(BLOCKED_PLACEHOLDER));
  assert.equal(
    flagged.parts[0].type === "text" && flagged.parts[0].text,
    "something inappropriate",
  );
});

test("held prompts keep visible text through persistence while staying out of model history", () => {
  const held = JSON.parse(JSON.stringify(flagHeldPrompt(typed)));
  assert.ok(isHeldPrompt(held));
  assert.ok(!isBlockedPrompt(held));
  assert.deepEqual(held.parts, [
    { type: "text", text: "something inappropriate" },
  ]);
  assert.ok(!moderationConversation([held]).includes("inappropriate"));
  assert.equal(
    maskBlockedPrompts([held])[0].parts[0].text,
    BLOCKED_PLACEHOLDER,
  );
});
