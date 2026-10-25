import { test } from "node:test";
import assert from "node:assert/strict";
import { privateProviderFetch } from "../lib/provider-privacy";
test("child generation cannot relax retention filters through request/provider settings", async () => {
  const saved = [
    process.env.DREAMFORGE_AUTH_ENABLED,
    process.env.STUDENT_LOGIN_ENABLED,
  ];
  process.env.DREAMFORGE_AUTH_ENABLED = "true";
  try {
    let sent: any;
    const fetch = privateProviderFetch(async (_url, init) => {
      sent = JSON.parse(String(init?.body));
      return Response.json({});
    });
    await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        provider: { zdr: false, data_collection: "allow", sort: "price" },
      }),
    });
    assert.deepEqual(sent.provider, {
      zdr: true,
      data_collection: "deny",
      sort: "price",
    });
  } finally {
    for (const [i, key] of [
      "DREAMFORGE_AUTH_ENABLED",
      "STUDENT_LOGIN_ENABLED",
    ].entries()) {
      if (saved[i] === undefined) delete process.env[key];
      else process.env[key] = saved[i];
    }
  }
});
