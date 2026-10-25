import { bounded } from "../lib/bounded.ts";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
import {
  rewritePreview,
  previewCsp,
  assetCapability,
} from "../lib/preview-access.ts";
const dir = await mkdtemp(path.join(tmpdir(), "dreamforge-next-preview-"));
await mkdir(dir + "/app");
await writeFile(
  dir + "/package.json",
  JSON.stringify({
    name: "preview-fixture",
    private: true,
    dependencies: { next: "16.1.5", react: "19.2.4", "react-dom": "19.2.4" },
  }),
);
await symlink(path.resolve("../node_modules"), dir + "/node_modules");
await writeFile(
  dir + "/app/layout.tsx",
  `export default function Layout({children}){return <html><body>{children}</body></html>}`,
);
await writeFile(
  dir + "/app/page.tsx",
  `'use client';import {useState} from 'react';export default function Home(){const [n,setN]=useState(0);return <main><h1>Isolated Next scorekeeper</h1><p id="score">{n}</p><button onClick={()=>setN(n+1)}>Add one</button><button onClick={()=>setN(0)}>Reset</button></main>}`,
);
const reservation = createServer();
await new Promise((r) => reservation.listen(0, "127.0.0.1", r));
const port = reservation.address().port;
await new Promise((r) => reservation.close(r));
let logs = "";
const child = spawn(
  process.execPath,
  [
    path.resolve("../node_modules/next/dist/bin/next"),
    "dev",
    "--webpack",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  {
    cwd: dir,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
);
child.stdout.on("data", (b) => (logs += b));
child.stderr.on("data", (b) => (logs += b));
const upstream = `http://127.0.0.1:${port}`;
let proxy, browser;
try {
  let ready = false;
  for (let n = 0; n < 60; n++) {
    try {
      const r = await fetch(upstream, { signal: AbortSignal.timeout(10000) });
      if (r.status === 200) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready) throw Error("Next start failed: " + logs.slice(-800));
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture";
  const project = "vm-nextfixture",
    cap = assetCapability(project);
  proxy = createServer(async (req, res) => {
    try {
      const origin = `http://127.0.0.1:${proxy.address().port}`;
      const prefix = `/api/projects/${project}/preview-assets/${cap}`;
      if (req.url === "/") {
        res.setHeader("Content-Type", "text/html");
        res.end(
          `<iframe sandbox="allow-scripts allow-same-origin" src="/entry"></iframe>`,
        );
        return;
      }
      const asset = req.url.startsWith(prefix);
      const target = asset ? req.url.slice(prefix.length) : "/";
      const r = await fetch(upstream + target);
      const type = r.headers.get("content-type") || "text/plain";
      res.statusCode = r.status;
      res.setHeader("Content-Type", type);
      res.setHeader("Access-Control-Allow-Origin", "*");
      if (!asset) res.setHeader("Content-Security-Policy", previewCsp(origin));
      const bytes = await r.arrayBuffer();
      res.end(
        /javascript|text\/css|text\/html/.test(type)
          ? rewritePreview(
              new TextDecoder().decode(bytes),
              project,
              cap,
              type.includes("html"),
            )
          : Buffer.from(bytes),
      );
    } catch {
      res.writeHead(503);
      res.end();
    }
  });
  await new Promise((r) => proxy.listen(0, "127.0.0.1", r));
  browser = await chromium.launch({
    executablePath:
      process.env.TEST_BROWSER_EXECUTABLE ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  const context = await bounded(browser.newContext(), 10000);
  const page = await bounded(context.newPage(), 10000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(`http://127.0.0.1:${proxy.address().port}`);
  const frame = page.frameLocator("iframe");
  await frame
    .getByRole("button", { name: "Add one", exact: true })
    .click({ timeout: 20000 });
  await frame.getByRole("button", { name: "Add one", exact: true }).click();
  if ((await frame.locator("#score").innerText()) !== "2")
    throw Error("Score did not change: " + JSON.stringify(errors));
  await frame.getByRole("button", { name: "Reset", exact: true }).click();
  if ((await frame.locator("#score").innerText()) !== "0")
    throw Error("Reset did not work");
  await page.screenshot({ path: ".e2e-results/isolated-next-preview.png" });
  console.log(
    JSON.stringify({
      nextHydration: true,
      clicks: "0 → 2 → Reset → 0",
      pageErrors: errors,
    }),
  );
} finally {
  if (browser) await bounded(browser.close(), 5000);
  if (proxy) await new Promise((r) => proxy.close(r));
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
  await rm(dir, { recursive: true, force: true });
}
