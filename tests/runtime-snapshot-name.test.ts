import { test } from "node:test";
import assert from "node:assert/strict";
import { runtimeSnapshotName } from "../lib/runtime-snapshot-name";
test("snapshot labels satisfy the actual Runtime identifier contract", () => {
  for (const label of [
    "Before run e97bdc2b-05e7",
    "Phase12 snapshot diagnostic",
    "  _A test",
    "🦖",
    "a".repeat(200),
  ])
    assert.match(
      runtimeSnapshotName(label),
      /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/,
    );
  assert.equal(runtimeSnapshotName("Before run 123"), "Before-run-123");
});
