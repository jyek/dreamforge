import { PROJECT_IDLE_SECONDS } from "../lib/project-idle.mjs";
/** One-time, resumable migration. Freestyle source VMs are retained, never deleted. */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import dotenv from "dotenv";
import { Freestyle } from "freestyle";
import { setDefaultAutoSelectFamilyAttemptTimeout } from "node:net";
setDefaultAutoSelectFamilyAttemptTimeout(5000);
const envFile = process.argv[2];
const backupRoot = process.argv[3];
if (!envFile || !backupRoot)
  throw Error(
    "Pass a private environment file and an absolute backup directory",
  );
Object.assign(process.env, dotenv.parse(await fs.readFile(envFile)));
const { database } = await import("../lib/database");
const { runtime, bindRuntime, runtimeSandbox, deleteRuntime, runtimePreview } =
  await import("../lib/project-runtime");
const { devVm, startDevServer } = await import("../lib/project-vm");
const { activityCommand } = await import("./activity-bridge.mjs");
const legacy = new Freestyle({
  apiKey: process.env.FREESTYLE_API_KEY,
  baseUrl: process.env.FREESTYLE_BASE_URL,
});
const excluded = new Set(["node_modules", ".next", ".cache", ".turbo"]);
await fs.mkdir(backupRoot, { recursive: true, mode: 0o700 });
const results: unknown[] = [];
try {
  const { rows } = await database().query(
    "select vm_id,metadata from adorable.projects order by updated_at desc",
  );
  await fs.writeFile(
    path.join(backupRoot, "projects.json"),
    JSON.stringify(rows, null, 2),
    { mode: 0o600 },
  );
  const chats = await database().query(
    "select vm_id,id,messages from adorable.conversations order by vm_id,id",
  );
  await fs.writeFile(
    path.join(backupRoot, "conversations.json"),
    JSON.stringify(chats.rows),
    { mode: 0o600 },
  );
  for (const row of rows) {
    const id = row.vm_id;
    const saved = await database().query(
      "select sandbox_id from adorable.runtime_bindings where project_id=$1",
      [id],
    );
    if (saved.rowCount) {
      console.log(JSON.stringify({ id, skipped: true }));
      continue;
    }
    const dir = path.join(backupRoot, id, "workspace");
    const hashes: Record<string, string> = {};
    const skipped: string[] = [];
    const vm = legacy.vms.ref(id);
    const pending: string[] = [];
    async function retry<T>(work: () => Promise<T>): Promise<T> {
      for (let attempt = 0; ; attempt++) {
        try {
          return await work();
        } catch (error) {
          if (attempt >= 4) throw error;
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        }
      }
    }
    async function discover(relative: string) {
      const entries = await retry(() =>
        vm.fs.readDir("/workspace" + (relative ? "/" + relative : "")),
      );
      for (const entry of entries) {
        if (excluded.has(entry.name)) continue;
        if (
          entry.name === "." ||
          entry.name === ".." ||
          /[\/\0]/.test(entry.name)
        )
          throw Error("Invalid source entry");
        const next = relative ? relative + "/" + entry.name : entry.name;
        if (entry.kind === "directory") await discover(next);
        else if (entry.kind === "file") pending.push(next);
        else skipped.push(next);
      }
    }
    await discover("");
    let cursor = 0;
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (cursor < pending.length) {
          const next = pending[cursor++];
          const bytes = await retry(() => vm.fs.readFile("/workspace/" + next));
          await fs.mkdir(path.dirname(path.join(dir, next)), {
            recursive: true,
            mode: 0o700,
          });
          await fs.writeFile(path.join(dir, next), bytes, { mode: 0o600 });
          hashes[next] = createHash("sha256").update(bytes).digest("hex");
        }
      }),
    );
    if (!hashes["package.json"]) throw Error(`Backup incomplete for ${id}`);
    await fs.writeFile(
      path.join(backupRoot, id, "manifest.json"),
      JSON.stringify({ hashes, skipped }, null, 2),
      { mode: 0o600 },
    );
    console.log(
      JSON.stringify({
        id,
        backedUpFiles: Object.keys(hashes).length,
        skipped,
      }),
    );
    const sandbox = await runtime().sandboxes.create({
      name: `dreamforge-${id}`,
      vcpu: 2,
      memoryMiB: 4096,
      diskMiB: 10240,
      idlePauseSeconds: PROJECT_IDLE_SECONDS,
      autoWake: true,
      labels: { application: "dreamforge", projectId: id, role: "dev" },
    });
    try {
      await sandbox.files.upload(dir, "/workspace");
      await sandbox.exec(
        "sudo mkdir -p /adorable/conversations /adorable/terminals && sudo chown -R $(id -u):$(id -g) /adorable",
        { check: true },
      );
      const install = await sandbox.exec(
        "cd /workspace && npm install --no-audit --no-fund",
        { timeoutMs: 240000 },
      );
      if (install.exitCode !== 0)
        throw Error(
          `Dependency installation failed for ${id}: ${install.stderr.slice(-400)}`,
        );
      await sandbox.exec(activityCommand, { check: true });
      await sandbox.previews.create(3000, {
        visibility: "private",
        ttlSeconds: 7 * 86400,
      });
      await bindRuntime(id, sandbox.id);
      await startDevServer(devVm(id));
      const preview = await runtimePreview(id);
      let ready = false;
      for (let i = 0; i < 45; i++) {
        const response = await fetch(preview.baseUrl, {
          headers: { "x-runtime-preview-token": preview.token! },
          signal: AbortSignal.timeout(10000),
        }).catch(() => null);
        if (response) {
          await response.body?.cancel();
          if (response.status === 200) {
            ready = true;
            break;
          }
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      if (!ready) throw Error(`Preview not ready for ${id}`);
      // Check the source survived transfer. Activity injection intentionally changes layout/public.
      for (const file of ["package.json", "app/page.tsx", "src/app/page.tsx"]) {
        if (!hashes[file] || file === "package.json") continue;
        const hash = createHash("sha256")
          .update(await sandbox.files.read("/workspace/" + file))
          .digest("hex");
        if (hash !== hashes[file])
          throw Error(`Source mismatch for ${id}: ${file}`);
      }
      await sandbox.pause();
      results.push({
        id,
        sandboxId: sandbox.id,
        files: Object.keys(hashes).length,
        previewReady: true,
      });
      await fs.writeFile(
        path.join(backupRoot, "runtime-migration.json"),
        JSON.stringify(results, null, 2),
        { mode: 0o600 },
      );
      console.log(
        JSON.stringify({
          id,
          migrated: true,
          files: Object.keys(hashes).length,
        }),
      );
    } catch (error) {
      await deleteRuntime(id).catch(() => {});
      await sandbox.delete().catch(() => {});
      throw error;
    }
  }
} finally {
  await database().end();
}
