import { test } from "node:test";
import assert from "node:assert/strict";
import { SafetyError } from "../lib/kids-safety";
import { recordModerationOutcome } from "../lib/prompt-review";
const fakeDb = () => {
  const calls: { sql: string; params: unknown[] }[] = [];
  return {
    calls,
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      return { rowCount: 1 };
    },
  };
};
test("a moderation block is written to the teacher's prompt record", async () => {
  const db = fakeDb();
  const error = new SafetyError("I can’t help with that request.", "blocked", {
    decision: "block",
    categories: ["sexual_minors"],
    severity: "critical",
  });
  await recordModerationOutcome(db, "review-1", error);
  assert.equal(db.calls.length, 1);
  assert.match(db.calls[0].sql, /update prompt_reviews/);
  assert.deepEqual(db.calls[0].params, [
    "review-1",
    "block",
    ["sexual_minors"],
    "critical",
  ]);
  // A teacher's own review of the row is never overwritten.
  assert.match(db.calls[0].sql, /reviewed_at is null/);
});
test("a review decision is recorded for the teacher too", async () => {
  const db = fakeDb();
  await recordModerationOutcome(
    db,
    "review-2",
    new SafetyError("unsure", "blocked", {
      decision: "review",
      categories: ["violence"],
      severity: "medium",
    }),
  );
  assert.equal(db.calls[0].params[1], "review");
});
test("outages and quota errors do not mark a prompt as blocked", async () => {
  const db = fakeDb();
  await recordModerationOutcome(
    db,
    "review-3",
    new SafetyError("busy", "unavailable"),
  );
  await recordModerationOutcome(
    db,
    "review-3",
    new SafetyError("tokens", "quota"),
  );
  await recordModerationOutcome(
    db,
    "review-3",
    new SafetyError("ok", "blocked", {
      decision: "allow",
      categories: [],
      severity: "low",
    }),
  );
  assert.equal(db.calls.length, 0);
});
