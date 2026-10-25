import { test } from "node:test";
import assert from "node:assert/strict";
import { resumeProjectRuntime, runtimeFailure } from "../lib/runtime-readiness";

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
