import { Sandbox } from "@vercel/sandbox";
import { randomUUID } from "node:crypto";
import { BLANK_PROJECT_COMMAND } from "./blank-project.mjs";
import { PROJECT_IDLE_SECONDS } from "./runtime-policy.mjs";

export const VERCEL_TEST_BASE = "dreamforge-vercel-pilot-base";
const prefix = "dreamforge-vercel-pilot-";
const healthCommand =
  'fetch("http://127.0.0.1:3000", {signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))';
const quote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";

async function run(sandbox: Sandbox, command: string, sudo = false) {
  const result = await sandbox.runCommand({
    cmd: "bash",
    args: ["-lc", command],
    sudo,
    timeoutMs: 240000,
  });
  const [stdout, stderr] = await Promise.all([
    result.stdout(),
    result.stderr(),
  ]);
  if (result.exitCode !== 0)
    throw new Error(
      `Workspace command failed: ${stderr.slice(-600) || stdout.slice(-600)}`,
    );
  return stdout;
}

/** Create the prepared Next.js/shadcn filesystem once, then fork it for tests. */
export async function prepareVercelTestBase() {
  let sandbox: Sandbox;
  try {
    return await Sandbox.get({ name: VERCEL_TEST_BASE, resume: false });
  } catch (error) {
    // Only a missing base permits creation; authentication and quota failures stay visible.
    if (!/not.found|404/i.test(String(error))) throw error;
  }
  sandbox = await Sandbox.create({
    name: VERCEL_TEST_BASE,
    image: "vercel/sandbox/node:22",
    resources: { vcpus: 2 },
    timeout: PROJECT_IDLE_SECONDS * 1000,
    persistent: true,
    snapshotExpiration: 7 * 24 * 60 * 60 * 1000,
    keepLastSnapshots: { count: 1, deleteEvicted: true },
  });
  try {
    const user = await sandbox.getDefaultUser();
    await run(
      sandbox,
      `ln -s ${quote(sandbox.cwd)} /workspace && mkdir -p /adorable && chown ${quote(user.username + ":" + user.group)} /adorable`,
      true,
    );
    await run(
      sandbox,
      "git clone --depth 1 https://github.com/freestyle-sh/freestyle-base-nextjs-shadcn /tmp/dreamforge-template && cp -a /tmp/dreamforge-template/. /workspace/ && rm -rf /tmp/dreamforge-template",
    );
    await run(sandbox, BLANK_PROJECT_COMMAND);
    await run(
      sandbox,
      "cd /workspace && npm ci --no-audit --no-fund && rm -rf .git",
    );
    await sandbox.stop();
    return sandbox;
  } catch (error) {
    await sandbox.delete({ deleteOrphanSnapshots: true });
    throw error;
  }
}

export function validVercelTestName(name: string) {
  return new RegExp(`^${prefix}[a-f0-9]{32}$`).test(name);
}

export class VercelTestWorkspace {
  constructor(public sandbox: Sandbox) {}
  static async create() {
    const sandbox = await Sandbox.fork({
      sourceSandbox: VERCEL_TEST_BASE,
      name: prefix + randomUUID().replaceAll("-", ""),
      ports: [3000],
      timeout: PROJECT_IDLE_SECONDS * 1000,
      resources: { vcpus: 2 },
      persistent: true,
      keepLastSnapshots: { count: 1, deleteEvicted: true },
    });
    const workspace = new VercelTestWorkspace(sandbox);
    try {
      await workspace.start();
      return workspace;
    } catch (error) {
      await workspace.delete();
      throw error;
    }
  }
  static async get(name: string) {
    if (!validVercelTestName(name)) throw new Error("Invalid test workspace");
    return new VercelTestWorkspace(await Sandbox.get({ name, resume: false }));
  }
  async renew() {
    const remaining = this.sandbox.expiresAt
      ? this.sandbox.expiresAt.getTime() - Date.now()
      : 0;
    const extension = PROJECT_IDLE_SECONDS * 1000 - remaining;
    if (extension > 1000) await this.sandbox.extendTimeout(extension);
  }
  async start() {
    this.sandbox = await Sandbox.get({ name: this.sandbox.name, resume: true });
    await this.renew();
    const alive = await this.sandbox.runCommand({
      cmd: "node",
      args: ["-e", healthCommand],
      timeoutMs: 10000,
    });
    if (alive.exitCode !== 0) {
      await this.sandbox.runCommand({
        cmd: "bash",
        args: [
          "-lc",
          "cd /workspace && exec npm run dev > /adorable/dev.log 2>&1",
        ],
        detached: true,
      });
    }
    for (let attempt = 0; attempt < 30; attempt++) {
      const check = await this.sandbox.runCommand({
        cmd: "node",
        args: ["-e", healthCommand],
        timeoutMs: 5000,
      });
      if (check.exitCode === 0) return;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    const logs = await run(this.sandbox, "tail -50 /adorable/dev.log").catch(
      () => "No dev-server log available",
    );
    throw new Error("Test preview did not become ready: " + logs.slice(-1800));
  }
  async pause() {
    await this.sandbox.stop();
  }
  async delete() {
    await this.sandbox.delete({ deleteOrphanSnapshots: true });
  }
  async readFile(path: string) {
    await this.renew();
    return this.sandbox.fs.readFile(this.physicalPath(path), "utf8");
  }
  async writeFile(path: string, content: string) {
    await this.renew();
    await this.sandbox.fs.writeFile(this.physicalPath(path), content);
  }
  private physicalPath(path: string) {
    return path === "/workspace" || path.startsWith("/workspace/")
      ? this.sandbox.cwd + path.slice("/workspace".length)
      : path;
  }
  async exec(command: string) {
    await this.renew();
    return run(this.sandbox, command);
  }
  status() {
    return {
      name: this.sandbox.name,
      state: this.sandbox.status,
      previewUrl: this.sandbox.domain(3000),
      idleSeconds: PROJECT_IDLE_SECONDS,
      vcpus: this.sandbox.vcpus,
      memoryMiB: this.sandbox.memory,
    };
  }
}

export const VERCEL_TEST_PAGE = `"use client";
import { useEffect, useState } from "react";
export default function Page() {
 const [count,setCount]=useState(0);
 useEffect(()=>{const activity=()=>window.parent.postMessage({type:"adorable:preview-activity"},"*");window.addEventListener("pointerdown",activity);window.addEventListener("keydown",activity);return()=>{window.removeEventListener("pointerdown",activity);window.removeEventListener("keydown",activity);};},[]);
 return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",fontFamily:"system-ui",background:"#f7f8fc"}}><section style={{textAlign:"center",padding:32}}><p style={{color:"#6b7280"}}>DreamForge · Vercel Sandbox pilot</p><h1>Workspace test is running</h1><p>Next.js + Tailwind + shadcn ready · 5-minute idle timeout</p><button style={{padding:"12px 24px",borderRadius:12,border:0,background:"#111827",color:"white",cursor:"pointer"}} onClick={()=>setCount(count+1)}>Counter: {count}</button></section></main>;
}`;
