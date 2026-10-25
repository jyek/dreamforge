import { test } from "node:test";
import assert from "node:assert/strict";
import { assertWorkspaceAvailable, previewResponding, resumeProjectRuntime, runtimeFailure } from "../lib/runtime-readiness";
import { previewPageFailure } from "../lib/runtime-preview";
import { terminalFailureEvent } from "../lib/terminal-stream";

test("wake and restart return for polling without waiting for provider readiness", async () => {
  for (const state of ["paused", "pausing", "stopped"]) {
    const calls: string[] = [];
    const signal = new AbortController().signal;
    const action = (name: string) => async (options: { wait: false; signal: AbortSignal }) => {
      assert.equal(options.wait, false);
      assert.equal(options.signal, signal);
      calls.push(name);
    };
    await resumeProjectRuntime({ state, wake: action("wake"), restart: action("restart") },
      async () => { calls.push("server"); }, signal);
    assert.deepEqual(calls, [state === "stopped" ? "restart" : "wake"]);
  }
});

test("in-flight lifecycle transitions never queue another wake or guest command", async () => {
  for (const state of ["starting", "resuming", "stopping", "running"]) {
    const calls: string[] = [];
    await resumeProjectRuntime({ state,
      wake: async () => { calls.push("wake"); },
      restart: async () => { calls.push("restart"); },
    }, async () => { calls.push("server"); }, new AbortController().signal);
    assert.deepEqual(calls, state === "running" ? ["server"] : []);
  }
});

test("failed provider operations stop polling and preserve private diagnostics", () => {
  const failure = runtimeFailure({ code: "operation_failed", message: "private host details" });
  assert.equal(failure.body.state, "blocked");
  assert.match(failure.body.error, /saved files are preserved/);
  assert.doesNotMatch(failure.body.error, /private host/);
});

test("hosting error responses never make the workspace appear ready", async () => {
  for (const status of [200, 403, 404, 409, 429, 500, 503]) {
    assert.equal(await previewResponding("https://fixture.test", async () =>
      Response.json({ error: "sandbox_stopping" }, { status })), false);
  }
  for (const status of [200, 404, 500]) {
    assert.equal(await previewResponding("https://fixture.test", async () =>
      new Response("<html>App or compile error</html>", { status, headers: { "Content-Type": "text/html" } })), true);
  }
});

test("non-HTML hosting errors remain hosting failures instead of app-page errors", () => {
  const failure = previewPageFailure(Response.json({ error: "private upstream details" }, { status: 409 }));
  assert.equal(failure?.status, 503);
  assert.match(failure!.message, /hosting is unavailable/);
  assert.doesNotMatch(failure!.message, /private upstream/);
  assert.equal(previewPageFailure(new Response("<html></html>", { headers: { "Content-Type": "text/html" } })), null);
});

test("stopping workspaces fail before guest access and terminal errors are visible safe SSE events", () => {
  let failure: unknown;
  try { assertWorkspaceAvailable("stopping"); } catch (error) { failure = error; }
  assert(failure);
  assert.match(runtimeFailure(failure).body.error, /workspace is still stopping/i);
  assert.match(terminalFailureEvent(failure), /^event: terminal-error\ndata: /);
  assert.match(terminalFailureEvent(failure), /workspace is still stopping/i);
  assert.doesNotMatch(terminalFailureEvent(Error("private upstream details")), /private upstream/);
  for (const state of ["running", "paused", "stopped"]) assert.doesNotThrow(() => assertWorkspaceAvailable(state));
});
