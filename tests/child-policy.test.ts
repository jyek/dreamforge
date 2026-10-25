import { test } from "node:test";
import assert from "node:assert/strict";
import { childPolicy, assertChildGeneration } from "../lib/child-policy";
import { SafetyError } from "../lib/kids-safety";
const keys = [
  "DREAMFORGE_AUTH_ENABLED",
  "STUDENT_LOGIN_ENABLED",
  "SAFETY_ENABLED",
  "STUDENT_AI_PROVIDER_APPROVED",
  "STUDENT_MODERATION_URL",
  "STUDENT_MODERATION_KEY",
] as const;
const text = [{ type: "text", text: "Build a scorekeeper" }];
for (const mode of ["platform", "classroom", "protected-demo"] as const)
  test(`${mode}: server policy rejects unfunded, unapproved, unmoderated and malformed attachment requests`, () => {
    const saved = keys.map((k) => process.env[k]);
    try {
      process.env.DREAMFORGE_AUTH_ENABLED =
        mode === "platform" ? "true" : "false";
      process.env.STUDENT_LOGIN_ENABLED =
        mode === "protected-demo" ? "false" : "true";
      process.env.SAFETY_ENABLED = mode === "protected-demo" ? "true" : "false";
      delete process.env.STUDENT_AI_PROVIDER_APPROVED;
      delete process.env.STUDENT_MODERATION_URL;
      delete process.env.STUDENT_MODERATION_KEY;
      assert.equal(childPolicy().enabled, true);
      assert.equal(childPolicy().shell, true);
      assert.equal(childPolicy().repositoryImport, true);
      assert.equal(childPolicy().images, true);
      assert.throws(() => assertChildGeneration(false, text), SafetyError);
      assert.throws(
        () => assertChildGeneration(true, text),
        /approves the provider/,
      );
      process.env.STUDENT_AI_PROVIDER_APPROVED = "true";
      assert.throws(() => assertChildGeneration(true, text), /Safety checks/);
      process.env.STUDENT_MODERATION_URL = "https://moderation.test";
      process.env.STUDENT_MODERATION_KEY = "fixture";
      assert.throws(
        () =>
          assertChildGeneration(true, [
            { type: "file", url: "data:image/png;base64,AA==" },
          ]),
        /PNG/,
      );
      assert.doesNotThrow(() => assertChildGeneration(true, text));
      assert.doesNotThrow(() => assertChildGeneration(true, [
        { type: "file", mediaType: "image/png", url: "data:image/png;base64,AA==" },
      ]));
      assert.throws(() => assertChildGeneration(true, [
        { type: "file", mediaType: "application/pdf", url: "data:application/pdf;base64,AA==" },
      ]), /PNG/);
    } finally {
      keys.forEach((k, i) => {
        if (saved[i] === undefined) delete process.env[k];
        else process.env[k] = saved[i];
      });
    }
  });
test("explicit adult demo may use its separate capabilities", () => {
  const saved = keys.map((k) => process.env[k]);
  try {
    process.env.DREAMFORGE_AUTH_ENABLED = "false";
    process.env.STUDENT_LOGIN_ENABLED = "false";
    process.env.SAFETY_ENABLED = "false";
    assert.equal(childPolicy().enabled, false);
    assert.doesNotThrow(() => assertChildGeneration(false, []));
  } finally {
    keys.forEach((k, i) => {
      if (saved[i] === undefined) delete process.env[k];
      else process.env[k] = saved[i];
    });
  }
});
