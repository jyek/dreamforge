import { test } from "node:test";
import assert from "node:assert/strict";
import { projectDetailsPatch } from "../lib/project-details";
test("legacy rename preserves description and explicit blank clears it", () => {
  assert.deepEqual(projectDetailsPatch({ name: " New name " }), {
    name: "New name",
  });
  assert.deepEqual(
    projectDetailsPatch({ name: "New name", description: "  " }),
    { name: "New name", description: "" },
  );
  assert.deepEqual(
    projectDetailsPatch({
      name: "New name",
      description: " A game\nwith puzzles ",
    }),
    { name: "New name", description: "A game\nwith puzzles" },
  );
});
test("invalid metadata cannot enter the name and description fields", () => {
  for (const name of ["", "x".repeat(81), "Name\nOther", "Name\0", null])
    assert.throws(() => projectDetailsPatch({ name }));
  for (const description of [123, null, "x".repeat(501), "Hidden\0text"])
    assert.throws(() => projectDetailsPatch({ name: "Valid", description }));
  assert.equal(
    projectDetailsPatch({ name: "x".repeat(80), description: "x".repeat(500) })
      .description?.length,
    500,
  );
});
