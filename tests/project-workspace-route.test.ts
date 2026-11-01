import assert from "node:assert/strict";
import { test } from "node:test";
import { projectWorkspaceRoute } from "../lib/project-workspace-route";

test("school and dashboard routes never receive the project editor layout", () => {
  for (const route of [
    "/",
    "/teachers",
    "/home",
    "/profile",
    "/school",
    "/students",
    "/classrooms",
    "/classrooms/123",
    "/safety",
    "/admin",
    "/projects",
    "/showcase/vm-abc",
    "/future-section",
    "/vm-abc/conversation/extra",
  ])
    assert.equal(projectWorkspaceRoute(route), null, route);
});
test("project and conversation routes keep their editor layout without stale conversation state", () => {
  assert.deepEqual(projectWorkspaceRoute("/vm-abc/conversation-1"), {
    projectId: "vm-abc",
    conversationId: "conversation-1",
  });
  assert.equal(projectWorkspaceRoute("/teachers"), null);
  assert.deepEqual(projectWorkspaceRoute("/vm-def"), {
    projectId: "vm-def",
    conversationId: null,
  });
});
