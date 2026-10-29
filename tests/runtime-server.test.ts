import assert from "node:assert/strict";
import { test } from "node:test";
import { ProjectVm, type runtimeSandbox } from "../lib/project-runtime";
import { startDevServer } from "../lib/project-vm";

for (const state of ["running", "exited", "missing"] as const) {
  test(`server preparation handles a ${state} named process without opening a WebSocket`, async () => {
    const calls: string[] = [];
    let record = JSON.stringify({ processId: "inherited-server" });
    const sandbox = {
      state: "running",
      files: {
        readText: async () => record,
        mkdir: async () => {},
        write: async (_path: string, value: string) => {
          record = value;
        },
      },
      processes: {
        get: async (id: string) => {
          calls.push(`get:${id}`);
          if (state === "missing")
            throw Object.assign(Error("Gone"), { status: 404 });
          return { state };
        },
      },
      spawn: async (command: string) => {
        assert.match(command, /npm run dev/);
        calls.push("spawn");
        return { id: "replacement-server" };
      },
      terminal: async () => {
        throw Error("Unnecessary terminal connection");
      },
    } as unknown as Awaited<ReturnType<typeof runtimeSandbox>>;
    const vm = new ProjectVm("fixture", async () => sandbox);
    await startDevServer(vm);
    assert.deepEqual(
      calls,
      state === "running"
        ? ["get:inherited-server"]
        : ["get:inherited-server", "spawn"],
    );
    assert.equal(
      JSON.parse(record).processId,
      state === "running" ? "inherited-server" : "replacement-server",
    );
  });
}

test("provider errors do not spawn duplicate servers", async () => {
  const sandbox = {
    state: "running",
    files: { readText: async () => JSON.stringify({ processId: "existing" }) },
    processes: {
      get: async () => {
        throw Object.assign(Error("Unavailable"), { status: 503 });
      },
    },
    spawn: async () => {
      assert.fail("Must not replace an unverified process");
    },
  } as unknown as Awaited<ReturnType<typeof runtimeSandbox>>;
  await assert.rejects(
    startDevServer(new ProjectVm("fixture", async () => sandbox)),
    /Unavailable/,
  );
});
