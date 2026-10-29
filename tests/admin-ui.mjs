// Real admin components with isolated fixtures; no live accounts or projects change.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
const root = process.cwd(),
  dir = await mkdtemp(path.join(tmpdir(), "dreamforge-admin-ui-"));
await mkdir(dir + "/app/admin", { recursive: true });
await mkdir(dir + "/app/login", { recursive: true });
await writeFile(
  dir + "/next.config.mjs",
  `export default {webpack(config){config.resolve.alias['@']=${JSON.stringify(root)};return config;}};`,
);
await symlink(root + "/node_modules", dir + "/node_modules");
await writeFile(
  dir + "/package.json",
  JSON.stringify({ name: "admin-fixture", private: true }),
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
const fixture = [
  {
    id: "vm-counter",
    name: "Counter",
    owner: "Example library",
    owned: false,
    exampleId: "vm-counter",
    featured: true,
    order: 1,
    description: "Try a counter",
    copiedAt: null,
  },
  {
    id: "vm-portfolio",
    name: "Personal Website",
    owner: "Example library",
    owned: false,
    exampleId: "vm-portfolio",
    featured: true,
    order: 2,
    description: "A personal site",
    copiedAt: null,
  },
  {
    id: "vm-owned",
    name: "Space Explorer",
    owner: "Student fixture",
    owned: true,
    exampleId: null,
    featured: false,
    order: 999,
    description: "",
    copiedAt: null,
  },
];
await writeFile(
  dir + "/app/page.tsx",
  `import {AdminShowcase} from '${root}/components/admin-showcase';export default function Page(){return <AdminShowcase name="Justin" initialProjects={${JSON.stringify(fixture)}}/>}`,
);
await writeFile(
  dir + "/app/admin/page.tsx",
  `export {default} from '../page';`,
);
await writeFile(
  dir + "/app/login/page.tsx",
  `import {PlatformAuthForm} from '${root}/components/platform-auth-form';export default function Page(){return <PlatformAuthForm admin returnTo="/admin"/>}`,
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
  let projects = structuredClone(fixture),
    saveRelease,
    failNext = false;
  const saveGate = new Promise((resolve) => (saveRelease = resolve)),
    requests = [];
  await context.route("**/api/admin/showcase", async (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    if (failNext) {
      failNext = false;
      await route.fulfill({
        status: 503,
        json: { error: "Fixture could not save. Try again." },
      });
      return;
    }
    if (body.action === "reorder")
      projects = projects.map((p) =>
        p.featured
          ? { ...p, order: body.projectIds.indexOf(p.exampleId) + 1 }
          : p,
      );
    else {
      if (body.projectId === "vm-owned" && body.action === "feature")
        await saveGate;
      projects = projects.map((p) =>
        p.id === body.projectId
          ? {
              ...p,
              featured: body.action === "feature",
              exampleId: p.id,
            }
          : p,
      );
    }
    await route.fulfill({ json: { projects } });
  });
  const page = await context.newPage();
  await page.goto(origin);
  await page.getByRole("heading", { name: "Choose what inspires." }).waitFor();
  await page.getByRole("button", { name: "Move Personal Website up" }).click();
  await page
    .getByRole("status")
    .getByText("Saved. The examples gallery is up to date.")
    .waitFor();
  assert.deepEqual(requests.at(-1), {
    action: "reorder",
    projectIds: ["vm-portfolio", "vm-counter"],
  });
  await page.getByRole("textbox", { name: "Search projects" }).fill("Space");
  assert.equal(await page.locator("tbody tr").count(), 1);
  assert.match(
    await page
      .getByRole("link", { name: "Preview project ↗" })
      .getAttribute("href"),
    /api\/admin\/projects\/vm-owned\/preview$/,
  );
  await page
    .getByRole("button", { name: "Show Space Explorer", exact: true })
    .click();
  await page
    .getByRole("status")
    .getByText("Updating the examples gallery…")
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Show Space Explorer", exact: true })
      .isDisabled(),
    true,
  );
  saveRelease();
  await page
    .getByRole("status")
    .getByText("Saved. The examples gallery is up to date.")
    .waitFor();
  assert.equal(requests.at(-1).projectId, "vm-owned");
  await page.getByRole("textbox", { name: "Search projects" }).fill("");
  failNext = true;
  await page
    .locator("table")
    .getByRole("button", { name: "Hide Personal Website", exact: true })
    .click();
  await page
    .getByRole("alert")
    .getByText("Fixture could not save. Try again.")
    .waitFor();
  assert.equal(
    await page
      .locator("table")
      .getByRole("button", { name: "Hide Personal Website", exact: true })
      .isEnabled(),
    true,
  );
  await page
    .locator("table")
    .getByRole("button", { name: "Hide Personal Website", exact: true })
    .click();
  await page
    .getByRole("status")
    .getByText("Saved. The examples gallery is up to date.")
    .waitFor();
  assert.equal(
    await page
      .locator("table")
      .getByRole("button", { name: "Show Personal Website", exact: true })
      .count(),
    1,
  );
  console.log(
    "PASS admin search, preview links, ordering, live-tag progress, show/hide and error recovery",
  );
  await context.route("**/api/platform/auth", async (route) => {
    const data = route.request().postDataJSON();
    assert.equal(data.login, "jyek");
    assert.equal(data.action, "login");
    assert.equal(data.admin, undefined);
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto(origin + "/login");
  assert.equal(
    await page
      .getByRole("link", { name: "Create an account", exact: true })
      .count(),
    0,
  );
  await page.getByLabel("Username or email").fill("jyek");
  await page.getByLabel("Password", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Sign in to admin →" }).click();
  await page.waitForURL(origin + "/admin");
  await page.getByRole("heading", { name: "Choose what inspires." }).waitFor();
  console.log(
    "PASS admin login returns to /admin without signup or client-side role claims",
  );
} finally {
  if (browser) await browser.close();
  child.kill("SIGTERM");
  await new Promise((r) => child.once("exit", r));
  await rm(dir, { recursive: true, force: true });
}
