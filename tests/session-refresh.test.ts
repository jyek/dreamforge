import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";
import {
  sealSession,
  openSession,
  SESSION_COOKIE,
  REFRESH_COOKIE,
  SESSION_WEEK,
} from "../lib/session-cookie";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-key";
process.env.SUPABASE_URL = "https://supabase.test";
process.env.SUPABASE_PUBLISHABLE_KEY = "test";
test("proxy renews access for SSR without extending the seven-day deadline", async () => {
  const original = globalThis.fetch,
    expires = Date.now() + SESSION_WEEK * 1000;
  globalThis.fetch = async () =>
    Response.json({
      access_token: "renewed-access",
      refresh_token: "rotated-refresh",
      expires_in: 3600,
    });
  try {
    const req = new NextRequest("https://dreamforge.test/home", {
      headers: {
        cookie: `${SESSION_COOKIE}=expired; ${REFRESH_COOKIE}=${sealSession({ token: "refresh", expires })}`,
      },
    });
    const response = await proxy(req);
    assert.equal(req.cookies.get(SESSION_COOKIE)?.value, "renewed-access");
    assert.equal(response.cookies.get(SESSION_COOKIE)?.value, "renewed-access");
    assert.deepEqual(openSession(response.cookies.get(REFRESH_COOKIE)!.value), {
      token: "rotated-refresh",
      expires,
    });
    assert.match(response.headers.get("set-cookie")!, /HttpOnly/);
  } finally {
    globalThis.fetch = original;
  }
});
test("expired week removes access even if its JWT has not expired", async () => {
  const req = new NextRequest("https://dreamforge.test/home", {
    headers: {
      cookie: `${SESSION_COOKIE}=access; ${REFRESH_COOKIE}=${sealSession({ token: "refresh", expires: Date.now() - 1 })}`,
    },
  });
  await proxy(req);
  assert.equal(req.cookies.get(SESSION_COOKIE), undefined);
});
