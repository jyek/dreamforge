import fs from "node:fs/promises";
import dotenv from "dotenv";
if (process.argv[2])
  Object.assign(process.env, dotenv.parse(await fs.readFile(process.argv[2])));
const { createProjectVms, devVm, startDevServer } =
  await import("../lib/project-vm");
const { runtimeSandbox, runtimePreview, deleteRuntime } =
  await import("../lib/project-runtime");
const { database } = await import("../lib/database");
let id: string | undefined;
try {
  const created = await createProjectVms("Runtime migration smoke");
  id = created.projectId;
  const vm = devVm(id);
  await vm.fs.writeTextFile("/workspace/runtime-smoke.txt", "files persist");
  const sandbox = await runtimeSandbox(id);
  await vm.fs.writeTextFile(
    "/workspace/app/page.tsx",
    "export default function Page(){return <main>Runtime migration works</main>}",
  );
  await startDevServer(vm);
  const ready = async () => {
    const p = await runtimePreview(id!);
    for (let i = 0; i < 30; i++) {
      const response = await fetch(p.baseUrl, {
        headers: { "x-runtime-preview-token": p.token! },
      });
      const text = await response.text();
      if (response.status === 200 && text.includes("Runtime migration works"))
        return true;
      await new Promise((r) => setTimeout(r, 1000));
    }
    return false;
  };
  if (!(await ready())) throw Error("Preview did not become ready");
  await sandbox.pause();
  await sandbox.wake();
  await startDevServer(vm);
  if (
    (await vm.fs.readTextFile("/workspace/runtime-smoke.txt")) !==
    "files persist"
  )
    throw Error("Files were lost");
  if (!(await ready())) throw Error("Preview did not resume");
  const shell = await vm.pty.open({
    slug: "smoke-shell",
    exec: "bash -l",
    cols: 120,
    rows: 30,
  });
  shell.detach();
  const attached = await vm.pty.attach({ session: "smoke-shell" });
  attached.detach();
  console.log(
    JSON.stringify({
      passed: true,
      projectId: id,
      previewAndPauseResume: true,
      namedTerminalReconnect: true,
    }),
  );
  await sandbox.pause();
} catch (error) {
  if (id) await deleteRuntime(id).catch(() => {});
  throw error;
} finally {
  if (id) await deleteRuntime(id);
  await database().end();
}
