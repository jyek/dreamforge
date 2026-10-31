import { test } from "node:test";
import assert from "node:assert/strict";
import { isMissingGroupSchema, projectAccessLevel } from "../lib/project-group";
const base = { ownerId: "owner", editorId: null, isMember: false };
test("an individual project is edited by its owner and nobody else", () => {
  assert.equal(projectAccessLevel({ ...base, userId: "owner" }), "edit");
  assert.equal(projectAccessLevel({ ...base, userId: "other" }), null);
});
test("in a group exactly one student edits and the rest only view", () => {
  const group = { ownerId: "owner", editorId: "bea" };
  assert.equal(
    projectAccessLevel({ ...group, isMember: true, userId: "bea" }),
    "edit",
  );
  // The owner keeps viewing but no longer edits while someone else holds the pen.
  assert.equal(
    projectAccessLevel({ ...group, isMember: false, userId: "owner" }),
    "view",
  );
  assert.equal(
    projectAccessLevel({ ...group, isMember: true, userId: "cal" }),
    "view",
  );
  assert.equal(
    projectAccessLevel({ ...group, isMember: false, userId: "stranger" }),
    null,
  );
  const editing = ["owner", "bea", "cal", "stranger"].filter(
    (userId) =>
      projectAccessLevel({
        ...group,
        isMember: userId === "cal" || userId === "bea",
        userId,
      }) === "edit",
  );
  assert.deepEqual(editing, ["bea"]);
});
test("a missing group table or column is recognised so old databases keep working", () => {
  assert.ok(isMissingGroupSchema({ code: "42703" }));
  assert.ok(isMissingGroupSchema({ code: "42P01" }));
  assert.ok(
    !isMissingGroupSchema({ code: "23505" }) &&
      !isMissingGroupSchema(new Error("x")),
  );
});
