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

test("a rejected rate limit retries once with identical policy, content and deadline", async () => {
  const original = globalThis.fetch;
  const requests: RequestInit[] = [];
  globalThis.fetch = async (_url, init) => {
    requests.push(init!);
    if (requests.length === 1)
      return Response.json(
        { error: "rate limited" },
        { status: 429, headers: { "Retry-After": "0" } },
      );
    return Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              decision: "block",
              categories: ["privacy"],
              severity: "high",
              score: 1,
            }),
          },
        },
      ],
    });
  };
  try {
    assert.equal(
      (await builtinModeration("Create a counter", "input")).decision,
      "block",
    );
    assert.equal(requests.length, 2);
    assert.equal(requests[0].body, requests[1].body);
    assert.equal(requests[0].signal, requests[1].signal);
    assert.equal(JSON.parse(String(requests[1].body)).provider.zdr, true);
  } finally {
    globalThis.fetch = original;
  }
});

test("persistent rate limits stop after one retry; long cooldowns and other errors are not replayed", async () => {
  const original = globalThis.fetch;
  try {
    for (const [status, cooldown, expectedCalls] of [
      [429, "0", 2],
      [429, "60", 1],
      [401, "0", 1],
      [402, "0", 1],
      [503, "0", 1],
    ] as const) {
      let calls = 0;
      globalThis.fetch = async () => {
        calls++;
        return Response.json(
          { error: "private provider body" },
          { status, headers: { "Retry-After": cooldown } },
        );
      };
      await assert.rejects(
        () => builtinModeration("Create a counter", "input"),
        (error: any) => {
          assert.equal(error.reason, "http_error");
          assert.equal(error.status, status);
          assert.doesNotMatch(error.message, /private provider body/);
          return true;
        },
      );
      assert.equal(calls, expectedCalls);
    }
  } finally {
    globalThis.fetch = original;
  }
});

test("accepted malformed, truncated and error responses fail closed without replaying generation", async () => {
  const original = globalThis.fetch;
  try {
    for (const [response, reason] of [
      [
        { error: { code: 429, message: "private upstream text" } },
        "response_error",
      ],
      [
        { choices: [{ finish_reason: "length", message: { content: "" } }] },
        "decision_truncated",
      ],
      [
        { choices: [{ message: { content: '{"decision":"allow"}' } }] },
        "invalid_decision",
      ],
      [null, "invalid_response"],
    ] as const) {
      let calls = 0;
      globalThis.fetch = async () => {
        calls++;
        return Response.json(response);
      };
      await assert.rejects(
        () => builtinModeration("Create a counter", "input"),
        (error: any) => {
          assert.equal(error.reason, reason);
          assert.doesNotMatch(error.message, /private upstream text/);
          return true;
        },
      );
      assert.equal(calls, 1);
    }
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      throw new TypeError("private network detail");
    };
    await assert.rejects(
      () => builtinModeration("Create a counter", "input"),
      (error: any) =>
        error.reason === "network_error" && !error.message.includes("private"),
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test("retry cooldown parsing honors seconds and dates without exceeding the interactive bound", async () => {
  const { moderationRetryDelay } = await import("../lib/moderation-request");
  const now = Date.parse("2026-10-26T12:00:00Z");
  assert.equal(moderationRetryDelay(null, now), 1000);
  assert.equal(moderationRetryDelay("0.5", now), 500);
  assert.equal(
    moderationRetryDelay("Mon, 26 Oct 2026 12:00:01 GMT", now),
    1000,
  );
  for (const value of [
    "60",
    "-1",
    "invalid",
    "",
    "Mon, 26 Oct 2026 12:01:00 GMT",
  ])
    assert.equal(moderationRetryDelay(value, now), null);
});
