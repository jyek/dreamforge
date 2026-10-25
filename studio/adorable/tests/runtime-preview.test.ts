import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveRuntimePreview,
  type RuntimePreview,
} from "../lib/runtime-preview";
const saved: RuntimePreview = {
  url: "https://preview.test",
  baseUrl: "https://preview.test",
  token: "private-fixture",
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
};
function fixture(value: RuntimePreview | null = saved, capturing = false) {
  const calls: string[] = [];
  return {
    calls,
    services: {
      readState: async () => {
        calls.push("state");
        return { capturing, saved: value };
      },
      prepare: async () => {
        calls.push("prepare");
      },
      issue: async () => {
        calls.push("issue");
        return saved;
      },
    },
  };
}
test("healthy saved preview skips all VM preparation and provider calls", async () => {
  const f = fixture();
  assert.deepEqual(await resolveRuntimePreview(false, f.services), saved);
  assert.deepEqual(f.calls, ["state"]);
});
test("snapshot capture blocks cached preview resolution before any wake", async () => {
  const f = fixture(saved, true);
  await assert.rejects(
    () => resolveRuntimePreview(false, f.services),
    /snapshot/,
  );
  assert.deepEqual(f.calls, ["state"]);
});
test("missing, expired and malformed saved credentials prepare before issuing", async () => {
  for (const v of [
    null,
    { ...saved, expiresAt: new Date(Date.now() - 1000).toISOString() },
    { ...saved, expiresAt: "invalid" },
    { ...saved, expiresAt: new Date(Date.now() + 1000).toISOString() },
  ]) {
    const f = fixture(v);
    await resolveRuntimePreview(false, f.services);
    assert.deepEqual(f.calls, ["state", "prepare", "issue"]);
  }
});
test("explicit refresh ignores saved credentials; invalidated binding is read afresh", async () => {
  const f = fixture();
  await resolveRuntimePreview(true, f.services);
  assert.deepEqual(f.calls, ["state", "prepare", "issue"]);
  let current: RuntimePreview | null = saved;
  const next = fixture();
  next.services.readState = async () => {
    next.calls.push("state");
    return { capturing: false, saved: current };
  };
  await resolveRuntimePreview(false, next.services);
  current = null;
  await resolveRuntimePreview(false, next.services);
  assert.deepEqual(next.calls, ["state", "state", "prepare", "issue"]);
});

test("cached preview repairs an unavailable host once and preserves app errors", async () => {
  const { fetchPreviewWithRecovery } = await import("../lib/runtime-preview");
  for (const status of [200, 404, 500, 502, 503, 504]) {
    let requests = 0,
      repairs = 0;
    const result = await fetchPreviewWithRecovery(
      async () =>
        new Response("page", { status: ++requests === 1 ? status : 200 }),
      async () => {
        repairs++;
      },
    );
    const unavailable = [502, 503, 504].includes(status);
    assert.equal(requests, unavailable ? 2 : 1);
    assert.equal(repairs, unavailable ? 1 : 0);
    assert.equal(result.status, unavailable ? 200 : status);
  }
  let requests = 0;
  await assert.rejects(
    () =>
      fetchPreviewWithRecovery(
        async () => {
          requests++;
          return new Response("unavailable", { status: 503 });
        },
        async () => {
          throw Error("snapshot in progress");
        },
      ),
    /snapshot/,
  );
  assert.equal(requests, 1);
});
