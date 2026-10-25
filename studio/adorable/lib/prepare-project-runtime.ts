import { runtimeSandbox } from "./project-runtime";
import { devVm, restartDevServer, startDevServer } from "./project-vm";
import { database } from "./database";

const preparing = new Map<string, Promise<void>>();

/** Restore ordinary developer permissions, including previously restricted VMs. */
export function prepareProjectRuntime(projectId: string): Promise<void> {
  const existing = preparing.get(projectId);
  if (existing) return existing;
  const next = prepare(projectId).finally(() => preparing.delete(projectId));
  preparing.set(projectId, next);
  return next;
}

async function prepare(projectId: string) {
  const sandbox = await runtimeSandbox(projectId);
  const policy = await sandbox.network.get();
  if (!policy.internet || policy.allow.length || policy.deny.length)
    await sandbox.network.on();
  const vm = devVm(projectId);
  await vm.start();
  await vm.data();
  const lock = await database().connect();
  try {
    await lock.query("begin");
    await lock.query("select pg_advisory_xact_lock(hashtext($1))", [
      "project-runtime:" + projectId,
    ]);
    if (await vm.fs.exists("/adorable/developer-runtime-v1")) {
      await startDevServer(vm);
    } else {
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
      await restartDevServer(vm);
      await vm.fs.writeTextFile("/adorable/developer-runtime-v1", "ready");
    }
    await lock.query("commit");
  } catch (error) {
    await lock.query("rollback");
    throw error;
  } finally {
    lock.release();
  }
}
