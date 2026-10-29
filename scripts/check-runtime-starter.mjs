/** Release-time validation keeps guest setup and manifest reads off creation. */
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Runtime } from "withruntime";

if (
  process.argv.includes("--if-production") &&
  process.env.VERCEL_ENV !== "production"
) {
  console.log(
    "Prepared starter release check: skipped outside Vercel Production.",
  );
  process.exit(0);
}

const snapshotId = process.env.RUNTIME_BASE_SNAPSHOT?.trim();
assert(snapshotId, "RUNTIME_BASE_SNAPSHOT is required.");
const runtime = new Runtime({ waitForCapacityMs: 0 });
const snapshot = await runtime.snapshots.get(snapshotId, { timeoutMs: 15000 });
assert.equal(snapshot.state, "ready", "Starter snapshot must be ready.");
assert.equal(
  snapshot.mode || "memory",
  "memory",
  "Starter must preserve its running server.",
);
assert(
  !snapshot.expiresAt || Date.parse(snapshot.expiresAt) > Date.now() + 86400000,
  "Starter snapshot expires within one day; renew it before release.",
);
const report = {
  snapshotId,
  state: snapshot.state,
  mode: snapshot.mode || "memory",
  expiresAt: snapshot.expiresAt,
};
if (!process.argv.includes("--metadata-only")) {
  const name = `dreamforge-starter-check-${randomUUID()}`;
  let sandbox;
  const started = performance.now();
  try {
    sandbox = await runtime.sandboxes.create(
      {
        snapshot: snapshotId,
        name,
        autoWake: true,
        idlePauseSeconds: 600,
        labels: { application: "dreamforge", role: "starter-check" },
      },
      { timeoutMs: 60000 },
    );
    report.createMs = Math.round(performance.now() - started);
    const manifest = JSON.parse(
      await sandbox.files.readText("/adorable/starter.json"),
    );
    assert.equal(manifest.version, "next-shadcn-v1");
    const { processId } = JSON.parse(
      await sandbox.files.readText("/adorable/terminals/dev.json"),
    );
    assert.equal(
      (await sandbox.processes.get(processId)).state,
      "running",
      "Inherited preview server must be running.",
    );
    const probe = async () => {
      const result = await sandbox.exec(
        `set -eu
test -w /adorable/conversations
test -w /workspace
test -f /adorable/developer-runtime-v1
test -d /workspace/node_modules
test -d /workspace/.next
test -z "$(find /adorable/conversations -type f -print -quit)"
curl -fsS --max-time 15 http://localhost:3000/ > /tmp/starter-check.html
grep -q 'Untitled Project' /tmp/starter-check.html`,
        { timeoutMs: 20000 },
      );
      assert.equal(
        result.exitCode,
        0,
        "Starter storage, dependencies and preview must be ready.",
      );
    };
    await probe();
    report.firstPreviewMs = Math.round(performance.now() - started);
    await sandbox.pause();
    const waking = performance.now();
    await sandbox.wake();
    assert.equal(
      (await sandbox.processes.get(processId)).state,
      "running",
      "Wake must reuse the same server process.",
    );
    await probe();
    report.wakeAndProbeMs = Math.round(performance.now() - waking);
    report.inheritedServerPreserved = true;
  } finally {
    // A timed-out create may have allocated compute. Reconcile only our exact
    // generated identity; never touch ordinary workspaces or the base snapshot.
    if (sandbox) await sandbox.delete();
    else
      for await (const candidate of await runtime.sandboxes.list({
        name,
        labels: { role: "starter-check" },
        includeStopped: true,
      })) {
        if (candidate.info.name === name) await candidate.delete();
      }
  }
}
console.log(JSON.stringify({ ...report, passed: true }));
