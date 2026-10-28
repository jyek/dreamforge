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
  dir + "/app/model-fixture.tsx",
  `"use client";import {AssistantRuntimeProvider,useLocalRuntime} from '@assistant-ui/react';import {ModelSettingsProvider} from '${root}/components/assistant-ui/model-settings';import {ModelSelector} from '${root}/components/assistant-ui/model-selector';export function ModelFixture(){const runtime=useLocalRuntime({async run(){return {content:[{type:'text',text:'Fixture'}]}}});return <AssistantRuntimeProvider runtime={runtime}><ModelSettingsProvider><ModelSelector/></ModelSettingsProvider></AssistantRuntimeProvider>;}`,
);
await writeFile(
  dir + "/app/page.tsx",
  `
import {ModelFixture} from './model-fixture';
import {ParentTopup} from '${root}/components/parent-topup';
import {PlatformDashboard} from '${root}/components/platform-dashboard';
import {StudioSidebar} from '${root}/components/studio-sidebar';
export default async function Page({searchParams}){
 const {screen}=await searchParams; const prepaid=screen?.startsWith("credit-");
 const data={user:{display_name:'Test builder',role:'child'},classes:[],projects:[],children:[],wallet:{token_limit:'1000',used_tokens:'100',reserved_tokens:'50',input_tokens:'50',output_tokens:'50',credit_limit_micros:'1000000',credit_used_micros:'0',credit_reserved_micros:'0'},prepaid,unconfirmed:[],paymentsEnabled:true,projectUsage:[]};
 return screen==='models'?<ModelFixture/>:(screen==='pay'||screen==='credit-pay')?<ParentTopup prepaid={prepaid} token="fixture-link" paid enabled sandbox sessionId="cs_test_fixture"/>:(screen==='project'||screen==='credit-project')?<StudioSidebar name="Test builder" role="child" navigation={<span>Project</span>}/>:<PlatformDashboard initialData={data} initialSection="profile"/>;
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
  await dashboard
    .locator(".df-account-tokens span")
    .getByText("S$0.00", { exact: true })
    .waitFor();
  const project = await context.newPage();
  await project.goto(origin + "/?screen=project");
  await project
    .locator(".df-account-tokens span")
    .getByText("S$0.00", { exact: true })
    .waitFor();
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
  await dashboard
    .locator(".df-account-tokens span")
    .getByText("S$5.00", { exact: true })
    .waitFor();
  await project.bringToFront();
  await project
    .locator(".df-account-tokens span")
    .getByText("S$5.00", { exact: true })
    .waitFor();
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
  const cash = await browser.newContext();
  let available = 1000000;
  const cashWallet = () => ({
    token_limit: "1000",
    used_tokens: "100",
    reserved_tokens: "50",
    input_tokens: "50",
    output_tokens: "50",
    credit_limit_micros: String(available + 50000),
    credit_used_micros: "50000",
    credit_reserved_micros: "0",
  });
  await cash.route("**/api/platform/balance", (r) =>
    r.fulfill({
      json: { remaining: 850, prepaid: true, availableCreditMicros: available },
    }),
  );
  await cash.route("**/api/platform/dashboard", (r) =>
    r.fulfill({
      json: {
        user: { display_name: "Test builder", role: "child" },
        classes: [],
        projects: [],
        children: [],
        wallet: cashWallet(),
        unconfirmed: [],
        paymentsEnabled: true,
        projectUsage: [
          {
            vm_id: "vm-usagefixture",
            project_name: "Counter",
            used_tokens: "100",
            input_tokens: "50",
            output_tokens: "50",
            credit_cost_micros: "50000",
            estimated_credit_micros: "0",
            legacy_runs: "0",
            models: [
              {
                model: "z-ai/glm-5.3-flash",
                input_tokens: "50",
                output_tokens: "50",
                used_tokens: "100",
                credit_cost_micros: "50000",
                estimated_credit_micros: "0",
                legacy_runs: "0",
              },
            ],
          },
        ],
        prepaid: true,
      },
    }),
  );
  await cash.route("**/api/platform/payment-status", (r) =>
    r.fulfill({
      json: {
        credited: true,
        tokens: 0,
        remaining: 850,
        prepaid: true,
        creditAddedMicros: 10000000,
        availableCreditMicros: 11000000,
      },
    }),
  );
  const account = await cash.newPage();
  await account.goto(origin + "/?screen=credit-dashboard");
  await account
    .getByRole("heading", { name: "Your spending", exact: true })
    .waitFor();
  await account.getByText("Total spend", { exact: true }).waitFor();
  await account.locator(".df-project-spend summary").click();
  await account
    .getByRole("cell", { name: "GLM 5.3 Flash", exact: true })
    .waitFor();
  await account
    .locator("tbody")
    .getByRole("cell", { name: "S$0.05", exact: true })
    .waitFor();
  await account
    .locator(".df-account-tokens span")
    .filter({ hasText: /^S\$1\.00$/ })
    .waitFor();
  const studio = await cash.newPage();
  await studio.goto(origin + "/?screen=credit-project");
  await studio.getByText("S$1.00", { exact: true }).waitFor();
  available = 11000000;
  const paid = await cash.newPage();
  await paid.goto(origin + "/?screen=credit-pay");
  await paid
    .getByText("S$10.00 added to the account.", { exact: true })
    .waitFor();
  await paid.getByText("S$11.00", { exact: true }).waitFor();
  for (const amount of ["S$10", "S$25", "S$50", "S$100"])
    await paid.getByText(amount, { exact: true }).waitFor();
  assert.equal(await paid.getByText("S$5", { exact: true }).count(), 0);
  await account.bringToFront();
  await account
    .locator(".df-account-tokens span")
    .filter({ hasText: /^S\$11\.00$/ })
    .waitFor();
  const usageRow = account.getByRole("row").filter({ hasText: "Counter" });
  await usageRow.getByRole("cell", { name: "100", exact: true }).waitFor();
  await usageRow.getByRole("cell", { name: "S$0.05", exact: true }).waitFor();
  await studio.bringToFront();
  await studio.getByText("S$11.00", { exact: true }).waitFor();
  assert.equal(
    await paid
      .getByText("0 tokens added to the account.", { exact: true })
      .count(),
    0,
  );
  console.log(
    "PASS one prepaid balance, cash checkout confirmation, and automatic credit refresh across dashboard and project",
  );
  const modelPage = await cash.newPage();
  const choices = [
    ["haiku", "Claude Haiku 5.5"],
    ["luna", "GPT-6 Luna"],
    ["glm", "GLM 5.3 Flash"],
    ["gemini-lite", "Gemini 3.5 Flash-Lite"],
    ["sonnet", "Claude Sonnet 5.5"],
    ["sol", "GPT-6.1 Sol"],
    ["gemini", "Gemini 3.8 Flash"],
  ].map(([id, name]) => ({
    id,
    name,
    paid: true,
    available: true,
  }));
  await modelPage.route("**/api/models", (r) =>
    r.fulfill({ json: { choices, prepaid: true } }),
  );
  await modelPage.goto(origin + "/?screen=models");
  await modelPage
    .getByRole("button", { name: "Coding model: Claude Haiku 5.5" })
    .click();
  const sonnet = modelPage
    .getByRole("menuitemradio")
    .filter({ hasText: "Claude Sonnet 5.5" });
  await sonnet.waitFor();
  await modelPage
    .getByRole("menuitemradio")
    .filter({ hasText: "GLM 5.3 Flash" })
    .getByText("Input S$0.00000030375 / token", { exact: true })
    .waitFor();
  await sonnet
    .getByText("Output S$0.00002025 / token", { exact: true })
    .waitFor();
  assert.match(
    await sonnet.getAttribute("title"),
    /S\$4.05 input \/ S\$20.25 output/,
  );
  assert.match(await sonnet.getAttribute("title"), /Advanced/);
  await sonnet.click();
  await modelPage
    .getByRole("button", { name: "Coding model: Claude Sonnet 5.5" })
    .waitFor();
  await modelPage
    .getByRole("button", { name: "Coding model: Claude Sonnet 5.5" })
    .click();
  const sol = modelPage
    .getByRole("menuitemradio")
    .filter({ hasText: "GPT-6.1 Sol" });
  assert.match(await sol.getAttribute("title"), /272K/);
  await sol.click();
  await modelPage
    .getByRole("button", { name: "Coding model: GPT-6.1 Sol" })
    .waitFor();
  console.log(
    "PASS Basic/Advanced labels and published model rates; Sonnet and Sol selection",
  );
} finally {
  if (browser) await browser.close();
  child.kill("SIGTERM");
  await new Promise((r) => child.once("exit", r));
  await rm(dir, { recursive: true, force: true });
}
