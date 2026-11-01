import { test } from "node:test";
import assert from "node:assert/strict";
import { describeStreamFailure } from "../lib/stream-diagnostics";
test("a provider error is described by type and status only", () => {
  const error = Object.assign(
    new Error("secret prompt text and file contents"),
    { name: "AI_APICallError", statusCode: 400, isRetryable: false },
  );
  const info = describeStreamFailure("error", error, "z-ai/glm-5", 2);
  assert.deepEqual(info, {
    kind: "error",
    errorName: "AI_APICallError",
    status: 400,
    code: undefined,
    retryable: false,
    causeName: undefined,
    causeCode: undefined,
    model: "z-ai/glm-5",
    step: 2,
  });
  assert.ok(!JSON.stringify(info).includes("secret"));
});
test("a timeout is recognisable and unusual values are dropped", () => {
  const timeout = new DOMException("took too long", "TimeoutError");
  assert.equal(
    describeStreamFailure("error", timeout).errorName,
    "TimeoutError",
  );
  const odd = describeStreamFailure(
    "error",
    {
      name: "has spaces and a secret",
      code: "x".repeat(200),
      cause: { name: "ECONNRESET" },
    },
    "model with spaces",
  );
  assert.equal(odd.errorName, undefined);
  assert.equal(odd.code, undefined);
  assert.equal(odd.model, undefined);
  assert.equal(odd.causeName, "ECONNRESET");
  assert.equal(describeStreamFailure("abort", undefined).kind, "abort");
  assert.doesNotThrow(() => describeStreamFailure("error", null));
});
