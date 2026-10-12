import assert from "node:assert/strict";
import {
  previewResponding,
  runtimeFailure,
  wakeVm,
} from "../lib/runtime-readiness";

for (const state of ["paused", "stopped", "running", "starting", "pausing"]) {
  const calls: string[] = [];
  await wakeVm(
    {
      data: async () => ({ state }),
      start: async () => {
        calls.push("start");
      },
    },
    async () => {
      calls.push("server");
    },
  );
  assert.deepEqual(
    calls,
    ["paused", "stopped"].includes(state) ? ["start", "server"] : [],
  );
}
const quotaError = {
  code: "LIMIT_EXCEEDED",
  message: "The allowance for memory_time, vcpu_time has been used.",
};
let serverStarted = false;
await assert.rejects(
  wakeVm(
    {
      data: async () => ({ state: "paused" }),
      start: async () => {
        throw quotaError;
      },
    },
    async () => {
      serverStarted = true;
    },
  ),
);
assert.equal(serverStarted, false);
assert.equal(runtimeFailure(quotaError).status, 429);
assert.equal(runtimeFailure(quotaError).body.state, "blocked");
assert.match(runtimeFailure(quotaError).body.error, /compute allowance/);
assert.equal(runtimeFailure(new Error("private diagnostic")).status, 503);
assert.doesNotMatch(
  runtimeFailure(new Error("private diagnostic")).body.error,
  /private diagnostic/,
);

for (const status of [200, 404, 500, 502, 503, 504]) {
  assert.equal(
    await previewResponding(
      "https://preview.example",
      async () => new Response("", { status }),
    ),
    ![502, 503, 504].includes(status),
  );
}
assert.equal(
  await previewResponding("https://preview.example", async () => {
    throw new Error("connection refused");
  }),
  false,
);
console.log(
  "PASS: paused and cold-boot server recovery, quota blockers, readiness checks and visible app errors",
);
