import { QuotaError } from "../lib/quota-error";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseModerationDecision,
  moderationConversation,
} from "../lib/moderation-decision";
import { SafetyError, screenContent } from "../lib/kids-safety";
const allow = { decision: "allow", categories: [], severity: "low", score: 0 };
test("valid JSON and fenced JSON are accepted; malformed or incomplete decisions fail closed", () => {
  assert.deepEqual(parseModerationDecision(JSON.stringify(allow)), allow);
  assert.deepEqual(
    parseModerationDecision("```json\n" + JSON.stringify(allow) + "\n```"),
    allow,
  );
  for (const text of [
    "allowed",
    '{"decision":"allow"}',
    JSON.stringify({ ...allow, score: 2 }),
    "Explanation " + JSON.stringify(allow),
    JSON.stringify({ ...allow, categories: ["unknown"] }),
  ])
    assert.throws(() => parseModerationDecision(text));
});
test("input screening keeps all conversation text and intent without old tool payloads or images", () => {
  const result = JSON.parse(
    moderationConversation([
      { role: "user", parts: [{ type: "text", text: "earlier intent" }] },
      {
        role: "assistant",
        parts: [
          { type: "text", text: "previous answer" },
          { type: "tool-readFile", text: "large untrusted tool payload" },
          { type: "image", text: "image data" },
        ],
      },
      { role: "user", parts: [{ type: "text", text: "latest request" }] },
    ]),
  );
  assert.deepEqual(result, [
    { role: "user", content: "earlier intent" },
    { role: "assistant", content: "previous answer" },
    { role: "user", content: "latest request" },
  ]);
});
test("temporary checker failures preserve the request and do not blame or refer users to a teacher", async () => {
  const env = { ...process.env };
  const fetch = globalThis.fetch;
  process.env.DREAMFORGE_AUTH_ENABLED = "true";
  process.env.STUDENT_MODERATION_URL = "https://moderation.test";
  process.env.STUDENT_MODERATION_KEY = "fixture";
  globalThis.fetch = async () => Response.json({ ...allow, score: "invalid" });
  try {
    await assert.rejects(
      () => screenContent("vm-fixture", null, "input", "Align player rows"),
      (error: unknown) => {
        assert(error instanceof SafetyError);
        assert.equal(error.kind, "unavailable");
        assert(error.preservesPrompt);
        assert.match(error.message, /retry/i);
        assert.doesNotMatch(error.message, /teacher/i);
        return true;
      },
    );
    globalThis.fetch = async () => {
      throw new QuotaError("You need more tokens for this request.");
    };
    await assert.rejects(
      () => screenContent("vm-fixture", null, "input", "Align player rows"),
      (error: unknown) => {
        assert(error instanceof SafetyError);
        assert.equal(error.kind, "quota");
        assert.match(error.message, /more tokens/);
        assert(error.preservesPrompt);
        return true;
      },
    );
    assert.equal(new SafetyError("blocked").preservesPrompt, false);
    assert.equal(new SafetyError("token limit", "quota").preservesPrompt, true);
  } finally {
    globalThis.fetch = fetch;
    for (const key of Object.keys(process.env))
      if (!(key in env)) delete process.env[key];
    Object.assign(process.env, env);
  }
});
