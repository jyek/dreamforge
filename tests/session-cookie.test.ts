import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sealSession,
  openSession,
  accessNeedsRefresh,
  SESSION_WEEK,
} from "../lib/session-cookie";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-key";
test("refresh cookie is encrypted, rejects tampering and expires after a week", () => {
  const value = {
    token: "test-refresh-secret",
    expires: Date.now() + SESSION_WEEK * 1000,
  };
  const sealed = sealSession(value);
  assert.ok(!sealed.includes(value.token));
  assert.deepEqual(openSession(sealed), value);
  const bytes = Buffer.from(sealed, "base64url");
  bytes[30] ^= 1;
  assert.equal(openSession(bytes.toString("base64url")), null);
  assert.equal(
    openSession(sealSession({ ...value, expires: Date.now() - 1 })),
    null,
  );
  assert.equal(SESSION_WEEK, 604800);
});
test("missing, expired and near-expiry access tokens trigger renewal", () => {
  const jwt = (seconds: number) =>
    "header." +
    Buffer.from(JSON.stringify({ exp: Date.now() / 1000 + seconds })).toString(
      "base64url",
    ) +
    ".signature";
  assert.equal(accessNeedsRefresh(), true);
  assert.equal(accessNeedsRefresh(jwt(-1)), true);
  assert.equal(accessNeedsRefresh(jwt(30)), true);
  assert.equal(accessNeedsRefresh(jwt(3600)), false);
});
