// Real payment/account components in an isolated Next app; Stripe and balances
// are browser fixtures. This test cannot charge a card or modify an account.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
const root = process.cwd();
const dir = await mkdtemp(path.join(tmpdir(), "dreamforge-payment-ui-"));
await mkdir(dir + "/app");
await writeFile(
  dir + "/next.config.mjs",
  `export default {webpack(config){config.resolve.alias['@']=${JSON.stringify(root)};return config;}};`,
);
await symlink(root + "/node_modules", dir + "/node_modules");
await writeFile(
  dir + "/package.json",
  JSON.stringify({ name: "payment-fixture", private: true }),
);
await writeFile(
  dir + "/tsconfig.json",
  JSON.stringify({
    compilerOptions: {
      target: "ES2017",
      lib: ["dom", "esnext"],
      jsx: "preserve",
      module: "esnext",
      moduleResolution: "bundler",
      esModuleInterop: true,
      skipLibCheck: true,
      allowJs: true,
      paths: { "@/*": [root + "/*"] },
    },
  }),
);
await writeFile(
  dir + "/app/layout.tsx",
  `export default function Layout({children}){return <html><body>{children}</body></html>}`,
);
await writeFile(
  dir + "/app/page.tsx",
  `
import {ParentTopup} from '${root}/components/parent-topup';
import {PlatformDashboard} from '${root}/components/platform-dashboard';
import {StudioSidebar} from '${root}/components/studio-sidebar';
export default async function Page({searchParams}){
 const {screen}=await searchParams;
 const data={user:{display_name:'Test builder',role:'child'},classes:[],projects:[],children:[],wallet:{token_limit:'1000',used_tokens:'100',reserved_tokens:'50',input_tokens:'50',output_tokens:'50'},unconfirmed:[],paymentsEnabled:true,projectUsage:[]};
 return screen==='pay'?<ParentTopup token="fixture-link" paid enabled sandbox sessionId="cs_test_fixture"/>:screen==='project'?<StudioSidebar name="Test builder" role="child" navigation={<span>Project</span>}/>:<PlatformDashboard initialData={data} initialSection="profile"/>;
}`,
);
const reservation = createServer();
await new Promise((r) => reservation.listen(0, "127.0.0.1", r));
const port = reservation.address().port;
await new Promise((r) => reservation.close(r));
let logs = "";
const child = spawn(
  process.execPath,
  [
    root + "/node_modules/next/dist/bin/next",
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
let browser;
try {
  const origin = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let n = 0; n < 60; n++) {
    try {
      if (
        (
          await fetch(origin + "/?screen=pay", {
            signal: AbortSignal.timeout(10000),
          })
        ).ok
      ) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  assert(ready, logs.slice(0, 10000));
  browser = await chromium.launch({
    executablePath:
      process.env.TEST_BROWSER_EXECUTABLE ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  const context = await browser.newContext();
  let balance = 850;
  const wallet = () => ({
    token_limit: String(balance + 150),
    used_tokens: "100",
    reserved_tokens: "50",
    input_tokens: "50",
    output_tokens: "50",
  });
  await context.route("**/api/platform/balance", (r) =>
    r.fulfill({ json: { remaining: balance } }),
  );
  await context.route("**/api/platform/dashboard", (r) =>
    r.fulfill({
      json: {
        user: { display_name: "Test builder", role: "child" },
        classes: [],
        projects: [],
        children: [],
        wallet: wallet(),
        unconfirmed: [],
        paymentsEnabled: true,
        projectUsage: [],
      },
    }),
  );
  const dashboard = await context.newPage();
  await dashboard.goto(origin);
  await dashboard.getByText("850", { exact: true }).waitFor();
  const project = await context.newPage();
  await project.goto(origin + "/?screen=project");
  await project.getByText("850", { exact: true }).waitFor();
  let checks = 0;
  let release;
  const held = new Promise((r) => (release = r));
  await context.route("**/api/platform/payment-status", async (route) => {
    checks++;
    assert.equal(route.request().method(), "POST");
    if (checks === 1) {
      await route.fulfill({
        json: { credited: false, tokens: 0, remaining: null },
      });
      return;
    }
    await held;
    await route.fulfill({
      json: { credited: true, tokens: 1000000, remaining: 1000850 },
    });
  });
  const pay = await context.newPage();
  await pay.goto(origin + "/?screen=pay");
  await pay.getByText("Confirming your payment and adding tokens…").waitFor();
  assert.equal(
    await pay
      .getByText("tokens added to the account.", { exact: false })
      .count(),
    0,
  );
  balance = 1000850;
  release();
  await pay
    .getByText("1,000,000 tokens added to the account.", { exact: true })
    .waitFor();
  await pay.getByText("1,000,850 tokens", { exact: true }).waitFor();
  await dashboard.bringToFront();
  await dashboard.getByText("1,000,850", { exact: true }).waitFor();
  await project.bringToFront();
  await project.getByText("1,000,850", { exact: true }).waitFor();
  console.log(
    "PASS verified payment confirmation and new balance; dashboard and project sidebar update across tabs",
  );
  await context.unroute("**/api/platform/payment-status");
  await context.route("**/api/platform/payment-status", (r) =>
    r.fulfill({
      status: 404,
      json: { error: "This top-up link has expired." },
    }),
  );
  await pay.reload();
  await pay
    .getByText("This top-up link has expired.", { exact: true })
    .waitFor();
  assert.equal(
    await pay
      .getByText("1,000,000 tokens added to the account.", { exact: true })
      .count(),
    0,
  );
  await context.unroute("**/api/platform/payment-status");
  await context.route("**/api/platform/payment-status", (r) =>
    r.fulfill({
      json: { credited: true, tokens: 1000000, remaining: 1000850 },
    }),
  );
  await pay.getByRole("button", { name: "Check payment again" }).click();
  await pay
    .getByText("1,000,000 tokens added to the account.", { exact: true })
    .waitFor();
  console.log(
    "PASS failed confirmation stays unconfirmed and explicit retry recovers",
  );
} finally {
  if (browser) await browser.close();
  child.kill("SIGTERM");
  await new Promise((r) => child.once("exit", r));
  await rm(dir, { recursive: true, force: true });
}
