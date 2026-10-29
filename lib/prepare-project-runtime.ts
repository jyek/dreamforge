import { ProjectVm, runtimeSandbox } from "./project-runtime";
import { startDevServer } from "./project-vm";
import type { Vm } from "./project-runtime";
import { database } from "./database";
import { assertWorkspaceAvailable } from "./runtime-readiness";

const preparing = new Map<string, Promise<void>>();
const workspaces = new Map<string, Promise<Vm>>();

/** Files and coding tools do not depend on a responding preview server. */
export function prepareProjectWorkspace(projectId: string): Promise<Vm> {
  const existing = workspaces.get(projectId);
  if (existing) return existing;
  const next = prepareWorkspace(projectId).finally(() =>
    workspaces.delete(projectId),
  );
  workspaces.set(projectId, next);
  return next;
}

/** Reuse the inherited named process; only spawn if it is missing or exited. */
export function prepareProjectRuntime(projectId: string): Promise<void> {
  const existing = preparing.get(projectId);
  if (existing) return existing;
  const next = prepareProjectWorkspace(projectId)
    .then(async (vm) => {
      // Keep server creation serialized across serverless workers. Source
      // requests never enter this lock or wait for the preview process.
      const lock = await database().connect();
      try {
        await lock.query("begin");
        await lock.query("select pg_advisory_xact_lock(hashtext($1))", [
          "project-runtime:" + projectId,
        ]);
        await startDevServer(vm);
        await lock.query("commit");
      } catch (error) {
        await lock.query("rollback");
        throw error;
      } finally {
        lock.release();
      }
    })
    .finally(() => preparing.delete(projectId));
  preparing.set(projectId, next);
  return next;
}

async function prepareWorkspace(projectId: string) {
  const sandbox = await runtimeSandbox(projectId, { timeoutMs: 10000 });
  assertWorkspaceAvailable(sandbox.state);
  if (sandbox.state === "stopped") await sandbox.restart();
  const vm = new ProjectVm(projectId, async () => sandbox);
  // Guest file access wakes a paused machine with its memory intact. The
  // durable marker avoids network-policy calls, locks and setup on every read.
  if (await vm.fs.exists("/adorable/developer-runtime-v1")) return vm;
  const lock = await database().connect();
  try {
    await lock.query("begin");
    await lock.query("select pg_advisory_xact_lock(hashtext($1))", [
      "project-runtime:" + projectId,
    ]);
    if (!(await vm.fs.exists("/adorable/developer-runtime-v1"))) {
      const policy = await sandbox.network.get();
      if (!policy.internet || policy.allow.length || policy.deny.length)
        await sandbox.network.on();
      const restored = await vm.exec({
        command: `set -eu
if test -f /adorable/child-runtime-v4; then
  sudo cp -n /workspace/next.config.ts /adorable/before-developer-next.config.ts
  sudo pkill -u dreamforge-app 2>/dev/null || true
  sudo chown -R "$(id -u):$(id -g)" /workspace
  sudo chmod u+rwx /workspace
  printf '%s\\n' 'export default { images: { unoptimized: true } };' > /workspace/next.config.ts
fi
mkdir -p /adorable
`,
        timeoutMs: 60000,
      });
      if (restored.statusCode !== 0)
        throw Error("Could not restore developer workspace permissions.");
      await vm.pty.close("dev").catch(() => {});
      await vm.fs.writeTextFile("/adorable/developer-runtime-v1", "ready");
    }
    await lock.query("commit");
  } catch (error) {
    await lock.query("rollback");
    throw error;
  } finally {
    lock.release();
  }
  return vm;
}
