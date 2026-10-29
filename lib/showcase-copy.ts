import { randomUUID } from "node:crypto";
import { database } from "./database";
import { runtime, runtimeSandbox } from "./project-runtime";
import { preparedStarterSnapshot } from "./prepared-starter";
import { requestSandboxCreation } from "./runtime-provisioning";
import { PROJECT_IDLE_SECONDS } from "./project-idle.mjs";
import { AdminShowcaseError } from "./admin-showcase";

/** Copy only project files: never publish the source account, chat, Git history or environment. */
export async function createShowcaseCopy(
  sourceId: string,
  actorId: string,
  onFailure?: (
    sandbox: Awaited<ReturnType<typeof runtimeSandbox>>,
  ) => Promise<void>,
) {
  const signal = AbortSignal.timeout(210000);
  const db = await database().connect();
  const hosting = runtime();
  let locked = false,
    stored = false;
  let sandbox: Awaited<ReturnType<typeof runtimeSandbox>> | undefined;
  let snapshotId: string | undefined;
  let provisionedId: string | undefined;
  try {
    const {
      rows: [lock],
    } = await db.query("select pg_try_advisory_lock(hashtext($1)) as locked", [
      "showcase-copy:" + sourceId,
    ]);
    locked = lock.locked;
    if (!locked)
      throw new AdminShowcaseError(
        "An example copy is already being created. Reload in a moment.",
      );
    signal.throwIfAborted();
    await db.query("begin");
    await db.query(
      "set local lock_timeout='5s';set local statement_timeout='30s'",
    );
    if (
      !(
        await db.query("select 1 from platform_admins where profile_id=$1", [
          actorId,
        ])
      ).rowCount
    )
      throw new AdminShowcaseError("Administrator access is required.", 403);
    const {
      rows: [existing],
    } = await db.query(
      "select vm_id from projects where metadata->>'showcaseSourceId'=$1",
      [sourceId],
    );
    if (existing) {
      await db.query("commit");
      return existing.vm_id as string;
    }
    const {
      rows: [source],
    } = await db.query(
      "select metadata,owner_id from projects where vm_id=$1 for update",
      [sourceId],
    );
    if (!source?.owner_id)
      throw new AdminShowcaseError("Choose a personal project to copy.", 400);
    await db.query(
      "insert into project_execution(project_id) values($1) on conflict do nothing",
      [sourceId],
    );
    const {
      rows: [state],
    } = await db.query(
      "select revision,active_run from project_execution where project_id=$1 for update",
      [sourceId],
    );
    if (state.active_run)
      throw new AdminShowcaseError(
        "This project has an active or unfinished run. Finish or recover it before creating an example.",
      );
    const original = await runtimeSandbox(sourceId, {
      timeoutMs: 10000,
      signal,
    });
    if (original.state === "stopped")
      await original.restart({
        signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
      });
    const bundle = "/tmp/dreamforge-showcase-" + randomUUID() + ".tgz";
    let archive: Uint8Array;
    try {
      await original.exec(
        `tar -C /workspace --exclude='./node_modules' --exclude='./.next' --exclude='./.*' --exclude='.env*' --exclude='.npmrc' --exclude='tsconfig.tsbuildinfo' -czf ${bundle} .`,
        { check: true, timeoutMs: 30000, signal },
      );
      const stat = await original.files.stat(bundle, {
        timeoutMs: 10000,
        signal,
      });
      if (!stat.exists || stat.size > 25 * 1024 * 1024)
        throw new AdminShowcaseError(
          "The project source is too large for an example copy. Reduce its assets first.",
          400,
        );
      archive = await original.files.read(bundle, { timeoutMs: 20000, signal });
    } finally {
      await original.files.remove(bundle, { timeoutMs: 5000 }).catch(() => {});
    }
    await db.query("commit"); // Editing can resume after this fixed revision has been captured.
    const id = "vm-" + randomUUID().replaceAll("-", ""),
      conversation = randomUUID(),
      now = new Date().toISOString();
    const sandboxId = await requestSandboxCreation({
      snapshot: preparedStarterSnapshot(),
      name: "dreamforge-showcase-" + randomUUID(),
      vcpu: 2,
      memoryMiB: 4096,
      diskMiB: 10240,
      idlePauseSeconds: PROJECT_IDLE_SECONDS,
      autoWake: true,
      network: { internet: true },
      labels: { application: "dreamforge", role: "dev", projectId: id },
    });
    provisionedId = sandboxId;
    sandbox = await hosting.sandboxes.get(sandboxId, {
      timeoutMs: 10000,
      signal,
    });
    try {
      const marker = JSON.parse(
        await sandbox.files.readText("/adorable/terminals/dev.json", {
          timeoutMs: 10000,
          signal,
        }),
      );
      await (await sandbox.processes.get(marker.processId)).kill("SIGKILL");
    } catch {}
    // A starter contains a running Next process. Stop its descendants too;
    // replacing dependencies under a surviving server can leave port 3000 broken.
    await sandbox.exec(
      "pkill -f '[n]ext-server' 2>/dev/null || true; pkill -f '[n]ext dev' 2>/dev/null || true; rm -rf /workspace/.next",
      { check: true, timeoutMs: 30000, signal },
    );
    await sandbox.files.unarchive("/workspace", archive!, {
      gzip: true,
      timeoutMs: 30000,
    });
    await sandbox.exec("cd /workspace && npm install --no-audit --no-fund", {
      check: true,
      timeoutMs: 120000,
      signal,
    });
    await sandbox.exec(
      "mkdir -p /adorable/terminals && printf ready > /adorable/developer-runtime-v1",
      { check: true, timeoutMs: 10000, signal },
    );
    const process = await sandbox.spawn(
      "cd /workspace && npm run dev -- --hostname 0.0.0.0 > /adorable/dev.log 2>&1",
      { pty: { cols: 120, rows: 30 }, stdin: "pipe", timeoutMs: 10000 },
    );
    await sandbox.files.write(
      "/adorable/terminals/dev.json",
      JSON.stringify({ processId: process.id }),
      { timeoutMs: 10000, signal },
    );
    const p = await sandbox.previews.create(
      3000,
      { visibility: "private", ttlSeconds: 7 * 86400 },
      { timeoutMs: 10000, signal },
    );
    let ready = false;
    const readinessDeadline = Date.now() + 30000;
    for (let n = 0; n < 20 && Date.now() < readinessDeadline; n++) {
      const response = await fetch(p.url, {
        headers: p.token ? { "x-runtime-preview-token": p.token } : {},
        signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
      }).catch(() => null);
      if (response) {
        const html = response.headers
          .get("content-type")
          ?.includes("text/html");
        await response.body?.cancel();
        if (response.ok && html) {
          ready = true;
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!ready)
      throw new AdminShowcaseError(
        "The example preview did not start successfully. The original project was not changed.",
        503,
      );
    await sandbox.update({ autoWake: false });
    try {
      snapshotId = (
        await sandbox.snapshot({
          mode: "disk",
          name: "showcase-" + id,
          retentionDays: 30,
          timeoutMs: 45000,
          signal,
        })
      ).id;
    } finally {
      await sandbox.update({ autoWake: true });
    }
    const name = source.metadata.name || "Untitled project";
    const metadata = {
      version: 3,
      name,
      description: "Explore this read-only project example.",
      createdAt: now,
      prodVmId: null,
      previewDomain: new URL(p.url).host,
      productionDomain: new URL(p.url).host,
      conversations: [
        {
          id: conversation,
          title: "Explore " + name,
          createdAt: now,
          updatedAt: now,
        },
      ],
      releases: [],
      liveReleaseId: null,
      showcaseSourceId: sourceId,
      showcaseSourceRevision: Number(state.revision),
      showcaseCopiedAt: now,
      exampleRecoverySnapshot: snapshotId,
    };
    signal.throwIfAborted();
    await db.query("begin");
    await db.query(
      "set local lock_timeout='5s';set local statement_timeout='30s'",
    );
    if (
      !(
        await db.query("select 1 from platform_admins where profile_id=$1", [
          actorId,
        ])
      ).rowCount
    )
      throw new AdminShowcaseError("Administrator access is required.", 403);
    await db.query(
      "insert into projects(vm_id,metadata,is_example) values($1,$2,false)",
      [id, JSON.stringify(metadata)],
    );
    await db.query(
      "insert into conversations(vm_id,id,messages) values($1,$2,'[]')",
      [id, conversation],
    );
    await db.query(
      "insert into runtime_bindings(project_id,sandbox_id,preview) values($1,$2,$3)",
      [
        id,
        sandboxId,
        JSON.stringify({
          url: p.urlWithToken || p.url,
          baseUrl: p.url,
          token: p.token,
          expiresAt: p.tokenExpiresAt,
        }),
      ],
    );
    await db.query(
      "insert into runtime_leases(vm_id,last_activity) values($1,now())",
      [id],
    );
    await db.query(
      "insert into admin_audit_log(actor_id,action,project_id,details) values($1,'showcase.copy_created',$2,$3)",
      [
        actorId,
        id,
        JSON.stringify({
          sourceProjectId: sourceId,
          sourceRevision: state.revision,
        }),
      ],
    );
    await db.query("commit");
    stored = true;
    return id;
  } catch (error) {
    await db.query("rollback").catch(() => {});
    if (!stored) {
      if (sandbox && onFailure) await onFailure(sandbox).catch(() => {});
      if (snapshotId)
        await hosting.snapshots
          .delete(snapshotId, { timeoutMs: 10000 })
          .catch(() => {});
      if (sandbox) await sandbox.delete({ timeoutMs: 10000 }).catch(() => {});
      else if (provisionedId)
        await hosting.sandboxes
          .delete(provisionedId, { timeoutMs: 10000 })
          .catch(() => {});
    }
    throw error;
  } finally {
    if (locked)
      await db
        .query("select pg_advisory_unlock(hashtext($1))", [
          "showcase-copy:" + sourceId,
        ])
        .catch(() => {});
    db.release();
  }
}
