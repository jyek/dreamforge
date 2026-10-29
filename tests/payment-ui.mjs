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
  `"use client";import {AssistantRuntimeProvider,useLocalRuntime} from '@assistant-ui/react';import {ModelSettingsProvider} from '${root}/components/assistant-ui/model-settings';import {ModelSelector} from '${root}/components/assistant-ui/model-selector';export function ModelFixture(){const runtime=useLocalRuntime({async run(){return {content:[{type:'text',text:'Fixture'}]}}});return <AssistantRuntimeProvider runtime={runtime}><ModelSettingsProvider><ModelSelector/><button onPointerDown={(event)=>event.stopPropagation()}>Outside menu</button><iframe title="Preview fixture" srcDoc="<button>Preview area</button>"/></ModelSettingsProvider></AssistantRuntimeProvider>;}`,
);
await writeFile(
  dir + "/app/page.tsx",
  `
import {ModelFixture} from './model-fixture';
import {ParentTopup} from '${root}/components/parent-topup';
import {PlatformDashboard} from '${root}/components/platform-dashboard';
import {StudioSidebar} from '${root}/components/studio-sidebar';
export default async function Page({searchParams}){
 const {screen}=await searchParams;
 const data={user:{display_name:'Test builder',role:'child'},classes:[],projects:[],children:[],wallet:{token_limit:'1000',used_tokens:'100',reserved_tokens:'50',input_tokens:'50',output_tokens:'50',credit_limit_micros:'1000000',credit_used_micros:'0',credit_reserved_micros:'0'},unconfirmed:[],paymentsEnabled:true,projectUsage:[]};
 return screen==='models'?<ModelFixture/>:(screen==='pay'||screen==='credit-pay')?<ParentTopup token="fixture-link" paid enabled sandbox sessionId="cs_test_fixture"/>:(screen==='project'||screen==='credit-project')?<StudioSidebar name="Test builder" role="child" navigation={<span>Project</span>}/>:<PlatformDashboard initialData={screen==='credit-dashboard'?undefined:data} initialSection="profile"/>;
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
  let paymentConfirmed = false;
  await cash.route("**/api/platform/payment-status", (r) =>
    r.fulfill({
      json: {
        credited: paymentConfirmed,
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
    .getByText("Confirming your payment and adding credit…", { exact: true })
    .waitFor();
  assert.equal(
    await paid
      .getByText("S$10.00 added to the account.", { exact: true })
      .count(),
    0,
  );
  paymentConfirmed = true;
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
  if (
    (await account.locator(".df-project-spend").getAttribute("open")) === null
  )
    await account.locator(".df-project-spend summary").click();
  const usageRow = account
    .getByRole("row")
    .filter({ hasText: "GLM 5.3 Flash" });
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
  await cash.unroute("**/api/platform/payment-status");
  await cash.route("**/api/platform/payment-status", (r) =>
    r.fulfill({
      status: 404,
      json: { error: "This top-up link has expired." },
    }),
  );
  await paid.reload();
  await paid
    .getByText("This top-up link has expired.", { exact: true })
    .waitFor();
  assert.equal(
    await paid
      .getByText("S$10.00 added to the account.", { exact: true })
      .count(),
    0,
  );
  await cash.unroute("**/api/platform/payment-status");
  await cash.route("**/api/platform/payment-status", (r) =>
    r.fulfill({
      json: {
        credited: true,
        creditAddedMicros: 10000000,
        availableCreditMicros: 11000000,
      },
    }),
  );
  await paid.getByRole("button", { name: "Check payment again" }).click();
  await paid
    .getByText("S$10.00 added to the account.", { exact: true })
    .waitFor();
  console.log(
    "PASS unconfirmed payment remains pending; failed confirmation can be retried without another payment",
  );
  const attempts = [];
  await cash.route("**/api/platform/checkout", (route) => {
    attempts.push(route.request().postDataJSON());
    return route.fulfill({
      status: 503,
      json: { error: "Payment service is unavailable. Please try again." },
    });
  });
  for (const amount of ["S$10", "S$10", "S$25"]) {
    const response = paid.waitForResponse("**/api/platform/checkout");
    await paid
      .locator("article")
      .filter({ has: paid.getByText(amount, { exact: true }) })
      .getByRole("button", { name: "Top up", exact: true })
      .click();
    await response;
    await paid
      .getByRole("alert")
      .getByText("Payment service is unavailable. Please try again.", {
        exact: true,
      })
      .waitFor();
  }
  assert.match(attempts[0].attemptId, /^[a-f0-9-]{36}$/);
  assert.equal(attempts[0].attemptId, attempts[1].attemptId);
  assert.notEqual(attempts[0].attemptId, attempts[2].attemptId);
  console.log(
    "PASS checkout failure offers retry, reuses its attempt ID, and gives a different package a new attempt",
  );
  const modelPage = await cash.newPage();
  const choices = [
    ["haiku", "Claude Haiku 5.5"],
    ["sonnet", "Claude Sonnet 5.5"],
    ["luna", "GPT-6 Luna"],
    ["sol", "GPT-6.1 Sol"],
    ["gemini-lite", "Gemini 3.5 Flash-Lite"],
    ["gemini", "Gemini 3.8 Flash"],
    ["glm", "GLM 5.3 Flash"],
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
  const menuText = await modelPage.getByRole("menu").innerText();
  assert.doesNotMatch(menuText, /S\$|per token|Input|Output/);
  assert.deepEqual(
    await modelPage.getByRole("menuitemradio").allTextContents(),
    [
      "Claude Haiku 5.5Basic",
      "GPT-6 LunaBasic",
      "Gemini 3.5 Flash-LiteBasic",
      "GLM 5.3 FlashBasic",
      "Claude Sonnet 5.5Advanced",
      "GPT-6.1 SolAdvanced",
      "Gemini 3.8 FlashAdvanced",
    ],
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
  assert.match(await sol.getAttribute("title"), /Advanced/);
  await sol.click();
  await modelPage
    .getByRole("button", { name: "Coding model: GPT-6.1 Sol" })
    .waitFor();
  await modelPage
    .getByRole("button", { name: "Coding model: GPT-6.1 Sol" })
    .click();
  await modelPage
    .getByRole("button", { name: "Outside menu", exact: true })
    .click();
  await modelPage
    .getByRole("menu", { name: "Coding models" })
    .waitFor({ state: "hidden" });
  await modelPage
    .getByRole("button", { name: "Coding model: GPT-6.1 Sol" })
    .click();
  await modelPage
    .frameLocator('iframe[title="Preview fixture"]')
    .getByRole("button", { name: "Preview area" })
    .click();
  await modelPage
    .getByRole("menu", { name: "Coding models" })
    .waitFor({ state: "hidden" });
  console.log(
    "PASS model tier ordering, clean labels, selection and outside-click dismissal including iframe",
  );
} finally {
  if (browser) await browser.close();
  child.kill("SIGTERM");
  await new Promise((r) => child.once("exit", r));
  await rm(dir, { recursive: true, force: true });
}
