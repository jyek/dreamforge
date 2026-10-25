/** Build a clean Runtime starter once; new projects inherit dependencies and warm state. */
import "dotenv/config";
import fs from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { Runtime } from "withruntime";
import {
  BLANK_PROJECT_COMMAND,
  TEMPLATE_COMPATIBILITY_COMMAND,
} from "../lib/blank-project.mjs";
import { activityCommand } from "./activity-bridge.mjs";
import { PROJECT_IDLE_SECONDS } from "../lib/project-idle.mjs";
const VERSION = "next-shadcn-v1";
const COMMIT = "f41536d65ee65adce2b327c30e39cc368dd69595";
const runtime = new Runtime({ waitForCapacityMs: 0 });
const quote = (s) => "'" + s.replaceAll("'", "'\\''") + "'";
const builder = await runtime.sandboxes.create({
  name: `dreamforge-starter-build-${randomUUID()}`,
  vcpu: 2,
  memoryMiB: 4096,
  diskMiB: 10240,
  idlePauseSeconds: PROJECT_IDLE_SECONDS,
  autoWake: true,
  labels: { application: "dreamforge", role: "starter-build" },
});
const check = async (command, timeoutMs = 60000) => {
  const r = await builder.exec(command, { timeoutMs });
  if (r.exitCode !== 0)
    throw Error(
      `Starter build command failed: ${(r.stderr || r.stdout).slice(-1500)}`,
    );
  return r;
};
try {
  await check(
    `sudo mkdir -p /workspace /adorable/conversations /adorable/terminals && sudo chown -R $(id -u):$(id -g) /workspace /adorable`,
  );
  await check(
    `git clone https://github.com/freestyle-sh/freestyle-base-nextjs-shadcn /tmp/starter && cd /tmp/starter && git checkout ${COMMIT} && cp -a . /workspace/ && rm -rf /workspace/.git /tmp/starter`,
    120000,
  );
  await check(BLANK_PROJECT_COMMAND + "\n" + TEMPLATE_COMPATIBILITY_COMMAND);
  await check("cd /workspace && npm ci --no-audit --no-fund", 240000);
  // The upstream template lock predates the React/Next security patches.
  // Resolve these exact patch releases once here, then freeze the resulting lock.
  await check("cd /workspace && npm install --save-exact next@15.5.28 react@19.1.10 react-dom@19.1.10 --no-audit --no-fund", 240000);
  await check(activityCommand);
  await check("cd /workspace && npx tsc --noEmit --incremental false", 60000);
  const lock = await builder.files.readText("/workspace/package-lock.json");
  const manifest = {
    version: VERSION,
    templateCommit: COMMIT,
    dependencies: {next: "15.5.28", react: "19.1.10", "react-dom": "19.1.10"},
    lockHash: createHash("sha256").update(lock).digest("hex"),
    createdAt: new Date().toISOString(),
  };
  await builder.files.write("/adorable/starter.json", JSON.stringify(manifest));
  await builder.files.write("/adorable/developer-runtime-v1", "ready");
  const process = await builder.spawn(
    "cd /workspace && npm run dev -- --hostname 0.0.0.0 > /adorable/dev.log 2>&1",
    { pty: { cols: 120, rows: 30 }, stdin: "pipe" },
  );
  await builder.files.write(
    "/adorable/terminals/dev.json",
    JSON.stringify({ processId: process.id }),
  );
  await check(
    "for attempt in $(seq 1 30); do if curl -fsS http://localhost:3000/ >/tmp/starter-page.html; then exit 0; fi; sleep 1; done; exit 1",
    60000,
  );
  // No project conversations, credentials, preview tokens or learner content enter the base.
  const snapshot = await builder.snapshot({
    mode: "memory",
    name: `dreamforge-${VERSION}-${Date.now()}`,
    retentionDays: 365,
    labels: { application: "dreamforge", role: "starter", version: VERSION },
  });
  const result = {
    ...manifest,
    snapshotId: snapshot.id,
    mode: snapshot.mode,
    builderId: builder.id,
  };
  await fs.mkdir(".deployment", { recursive: true });
  await fs.writeFile(
    ".deployment/prepared-starter.json",
    JSON.stringify(result, null, 2),
    { mode: 0o600 },
  );
  console.log(JSON.stringify(result));
} finally {
  await builder.delete();
}
