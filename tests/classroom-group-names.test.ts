import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classroomGroupNames,
  MAX_CLASSROOM_GROUPS,
} from "../lib/classroom-group-names";
test("classroom group naming uses only Nature & Animals and avoids existing names case-insensitively", () => {
  const first = classroomGroupNames(20, [], () => 0.4);
  const next = classroomGroupNames(
    20,
    first.names.map((n) => n.toUpperCase()),
    () => 0.4,
  );
  assert.equal(first.category, "Nature & Animals");
  assert.equal(next.category, "Nature & Animals");
  assert.equal(
    new Set([...first.names, ...next.names].map((n) => n.toLowerCase())).size,
    40,
  );
  assert.ok(first.names.includes("Foxes")); // the shuffled batch remains simple classroom vocabulary
});
test("group creation validates whole counts within the classroom maximum", () => {
  assert.equal(MAX_CLASSROOM_GROUPS, 20);
  assert.equal(classroomGroupNames(1).names.length, 1);
  assert.equal(classroomGroupNames(20).names.length, 20);
  for (const count of [0, -1, 21, 1.5, NaN, Infinity])
    assert.throws(() => classroomGroupNames(count));
});
