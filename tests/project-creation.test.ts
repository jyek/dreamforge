import { test } from "node:test";
import assert from "node:assert/strict";
import {
  projectCreationResult,
  projectCreationFailure,
} from "../lib/project-creation-response";
import { assertTestProject } from "../lib/e2e-cleanup";
test("creation handles empty, non-JSON and incomplete responses without parser errors", async () => {
  for (const response of [
    new Response(null, { status: 500 }),
    new Response("<html>Timeout</html>", { status: 504 }),
    Response.json({}),
    Response.json(null),
  ])
    await assert.rejects(
      () => projectCreationResult(response),
      /creation|create/i,
    );
  await assert.rejects(
    () =>
      projectCreationResult(
        Response.json({ error: "Project storage is full." }, { status: 503 }),
      ),
    /storage is full/,
  );
  const result = {
    id: "vm-fixture",
    conversationId: "00000000-0000-4000-8000-000000000001",
  };
  assert.deepEqual(await projectCreationResult(Response.json(result)), result);
});
test("provider storage errors become actionable JSON-safe messages without private details", () => {
  const failure = projectCreationFailure({
    code: "quota_exceeded",
    details: { limit: "sandbox.stored_mib" },
    message: "private account details",
  });
  assert.equal(failure.status, 503);
  assert.match(failure.error, /storage.*full/i);
  assert(!failure.error.includes("private"));
});
test("cleanup refuses ordinary projects and other owners before resource deletion", () => {
  const project = {
    owner_id: "owner",
    e2e_run_id: "00000000-0000-4000-8000-000000000001",
    name: "E2E Prompting Playground",
    username: "e2e_123456abcdef",
    auth_email: "e2e_123456abcdef@tests.dreamforge.invalid",
  };
  assert.doesNotThrow(() => assertTestProject(project, "owner"));
  for (const invalid of [
    { ...project, name: "Splendor" },
    { ...project, e2e_run_id: undefined },
    { ...project, owner_id: "other" },
    { ...project, username: "learner" },
    { ...project, auth_email: "learner@example.com" },
  ])
    assert.throws(() => assertTestProject(invalid, "owner"));
});

test("workspace-count and hosting-capacity errors are distinguished from token balance errors", () => {
  assert.match(
    projectCreationFailure({ code: "no_credit_kept_limit" }).error,
    /owner.*Runtime credit/,
  );
  assert.match(
    projectCreationFailure({ code: "no_capacity" }).error,
    /no space.*right now/,
  );
});
test("provisioning returns provider refusals once instead of silently retrying for minutes", async () => {
  const { requestSandboxCreation } =
    await import("../lib/runtime-provisioning");
  let calls = 0;
  await assert.rejects(
    () =>
      requestSandboxCreation(
        { name: "fixture" },
        {
          apiKey: "fixture",
          request: async () => {
            calls++;
            return Response.json(
              { error: { code: "no_capacity", status: 503 } },
              { status: 503 },
            );
          },
        },
      ),
    (error) => (error as { code: string }).code === "no_capacity",
  );
  assert.equal(calls, 1);
  assert.equal(
    await requestSandboxCreation(
      { name: "fixture" },
      {
        apiKey: "fixture",
        request: async () =>
          Response.json({
            id: "00000000-0000-4000-8000-000000000001",
            state: "starting",
          }),
      },
    ),
    "00000000-0000-4000-8000-000000000001",
  );
});
