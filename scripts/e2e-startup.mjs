/** Browser startup regression, with no model calls or ordinary learner edits. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { chromium } from "playwright-core";

config({ path: ".env.e2e.local", quiet: true });
const origin = new URL(
  process.env.E2E_BASE_URL || "https://dreamforge2.vercel.app",
).origin;
const output = path.resolve(process.env.E2E_OUTPUT || ".e2e-results/startup");
await fs.mkdir(output, { recursive: true });
assert(
  process.env.E2E_LOGIN && process.env.E2E_PASSWORD,
  "Configure a dedicated E2E login.",
);
const browser = await chromium.launch({
  executablePath: process.env.E2E_BROWSER_EXECUTABLE,
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
page.setDefaultTimeout(30000);
const request = context.request;
const report = { origin, startedAt: new Date().toISOString() };
let projectId, release;
try {
  const auth = await request.post(origin + "/api/platform/auth", {
    headers: { Origin: origin },
    data: { login: process.env.E2E_LOGIN, password: process.env.E2E_PASSWORD },
  });
  assert.equal(auth.status(), 200, "Dedicated test login failed.");
  const { user } = await (
    await request.get(origin + "/api/platform/auth")
  ).json();
  assert.equal(user?.role, "child");
  assert.match(
    user?.username || "",
    /^e2e_[a-f0-9]{12}$/,
    "Use a provisioned disposable-test account.",
  );
  const creating = performance.now();
  const response = await request.post(origin + "/api/projects", {
    headers: { Origin: origin },
    data: { name: "E2E Startup Playground", e2eRunId: randomUUID() },
    timeout: 120000,
  });
  assert.equal(response.status(), 200, "Disposable project creation failed.");
  const created = await response.json();
  projectId = created.id;
  assert(projectId && created.conversationId);
  await fs.writeFile(
    path.join(output, "project.json"),
    JSON.stringify({ origin, projectId }),
    { mode: 0o600 },
  );
  report.projectCreationMs = Math.round(performance.now() - creating);
  const pattern = `**/api/projects/${projectId}/runtime`;
  let holding = true;
  release = () => {
    holding = false;
  };
  let intercepted = false;
  await page.route(pattern, async (route) => {
    intercepted = true;
    if (holding)
      await route.fulfill({
        status: 202,
        json: { ready: false, state: "starting" },
      });
    else await route.continue();
  });
  const opening = performance.now();
  const pending = page.waitForRequest(pattern);
  await page.goto(`${origin}/${projectId}/${created.conversationId}`);
  await pending;
  const code = page.getByRole("tab", { name: "Code", exact: true });
  assert(
    await code.isEnabled(),
    "Code must be available before preview readiness.",
  );
  const input = page.getByRole("textbox", {
    name: "Message input",
    exact: true,
  });
  await input.fill("Build a simple counter");
  assert.equal(await input.inputValue(), "Build a simple counter");
  await code.click();
  const source = page.getByLabel("Highlighted source");
  await source.waitFor();
  assert.match(await source.innerText(), /export default function Home/);
  assert(intercepted, "Preview readiness must still be held.");
  report.sourceWhilePreviewPendingMs = Math.round(performance.now() - opening);
  report.promptAvailableBeforePreview = true;
  await page.screenshot({ path: path.join(output, "code-before-preview.png") });
  release();
  await page.unroute(pattern);
  await page.getByRole("tab", { name: "Preview", exact: true }).click();
  const title = page.frameLocator("iframe").locator("title");
  await title.waitFor({ state: "attached", timeout: 60000 });
  assert.equal(await title.textContent(), "Untitled Project");
  report.previewLoadedAfterRelease = true;
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  release?.();
  try {
    if (projectId) {
      const removed = await request.delete(
        `${origin}/api/projects/${projectId}/e2e`,
        {
          headers: { Origin: origin },
          timeout: 120000,
        },
      );
      assert.equal(removed.status(), 200, "Disposable project cleanup failed.");
      const { projects } = await (
        await request.get(origin + "/api/projects")
      ).json();
      assert(
        !projects.some((p) => p.id === projectId),
        "Test project remains after cleanup.",
      );
      report.cleanedUp = true;
      await fs.rm(path.join(output, "project.json"), { force: true });
    }
  } catch (error) {
    report.passed = false;
    report.cleanupError =
      error instanceof Error ? error.message : String(error);
    report.projectId = projectId;
    process.exitCode = 1;
  }
  await browser.close();
  await fs.writeFile(
    path.join(output, "latest.json"),
    JSON.stringify(report, null, 2),
  );
}
console.log(JSON.stringify(report));
