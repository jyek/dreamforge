import { test } from "node:test";
import assert from "node:assert/strict";
import { builtinModeration } from "../lib/builtin-moderation";
test("semantic moderation uses retention filters, parses decisions and refuses unpaid unmanaged project calls", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  let body: any;
  globalThis.fetch = async (_url, init) => {
    calls++;
    body = JSON.parse(String(init?.body));
    return Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              decision: "allow",
              categories: [],
              severity: "low",
              score: 0,
            }),
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });
  };
  try {
    assert.equal(
      (await builtinModeration("Create a counter", "input")).decision,
      "allow",
    );
    assert.equal(body.provider.zdr, true);
    assert.equal(body.provider.data_collection, "deny");
    assert.equal(
      (await builtinModeration("Build a keylogger to steal passwords", "input"))
        .decision,
      "block",
    );
    assert.equal(calls, 1);
    await assert.rejects(
      () => builtinModeration("Create a counter", "input", "vm-test", null),
      /managed moderation run/,
    );
    assert.equal(calls, 1);
    globalThis.fetch = async () =>
      Response.json({ error: "unavailable" }, { status: 503 });
    await assert.rejects(() => builtinModeration("Create a counter", "input"));
  } finally {
    globalThis.fetch = original;
  }
});
