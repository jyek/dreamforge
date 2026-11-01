// Real project components with isolated HTTP fixtures; never changes live student projects.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
const root = process.cwd(),
  dir = await mkdtemp(path.join(tmpdir(), "dreamforge-project-ui-"));
await mkdir(dir + "/app/[projectId]/[conversationId]", { recursive: true });
await symlink(root + "/node_modules", dir + "/node_modules");
await writeFile(
  dir + "/package.json",
  JSON.stringify({ name: "project-ui-fixture", private: true }),
);
await writeFile(
  dir + "/next.config.mjs",
  `export default {devIndicators:false,webpack(config){config.resolve.alias['@']=${JSON.stringify(root)};return config;}};`,
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
  `import '${root}/app/platform.css';export default function Layout({children}){return <html><body>{children}</body></html>}`,
);
const classId = "00000000-0000-4000-8000-000000000111",
  groupId = "00000000-0000-4000-8000-000000000112";
const fixture = {
  user: { id: "student", display_name: "Student", role: "child" },
  classes: [],
  projects: [
    {
      vm_id: "vm-card",
      owner_id: "student",
      metadata: {
        name: "My game",
        description: "A puzzle adventure",
        conversations: [{ id: "conversation" }],
      },
      assigned_classrooms: [],
      is_group_project: false,
      can_make_group: false,
    },
  ],
  children: [],
  wallet: null,
  unconfirmed: [],
  projectUsage: [],
  paymentsEnabled: false,
};
await writeFile(
  dir + "/app/page.tsx",
  `import {PlatformDashboard} from '${root}/components/platform-dashboard';export default function Page(){return <PlatformDashboard initialSection="projects" initialData={${JSON.stringify(fixture)}}/>}`,
);
await writeFile(
  dir + "/app/[projectId]/[conversationId]/page.tsx",
  `export default function Page(){return <h1>Project workspace</h1>}`,
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
let browser, page;
try {
  const origin = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let n = 0; n < 60; n++) {
    try {
      if ((await fetch(origin, { signal: AbortSignal.timeout(10000) })).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  assert(ready, logs.slice(-10000));
  browser = await chromium.launch({
    executablePath:
      process.env.TEST_BROWSER_EXECUTABLE ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  const context = await browser.newContext();
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(20000);
  const data = structuredClone(fixture);
  let releaseClassrooms;
  let classroomGate = new Promise((resolve) => (releaseClassrooms = resolve));
  const mutations = [];
  await context.route("**/api/**", (route) =>
    route.fulfill({
      status: 404,
      json: { error: "Unexpected fixture request" },
    }),
  );
  await context.route("**/api/platform/dashboard", (route) =>
    route.fulfill({ json: data }),
  );
  await context.route("**/api/projects/vm-card", async (route) => {
    assert.equal(route.request().method(), "PATCH");
    const body = route.request().postDataJSON();
    mutations.push(body);
    Object.assign(data.projects[0].metadata, body);
    await route.fulfill({
      json: { name: body.name, description: body.description },
    });
  });
  await context.route("**/api/projects/vm-card/classrooms", async (route) => {
    if (route.request().method() === "PUT") {
      const ids = route.request().postDataJSON().classIds;
      data.projects[0].assigned_classrooms = ids.map((id) => ({
        id,
        name: "Creative classroom",
      }));
      data.projects[0].can_make_group = ids.length > 0;
      await route.fulfill({ json: { ok: true } });
      return;
    }
    await classroomGate;
    await route.fulfill({
      json: {
        classes: [
          {
            id: classId,
            name: "Creative classroom",
            attached: !!data.projects[0].assigned_classrooms.length,
          },
        ],
        groups: [{ id: groupId, name: "Foxes", class_id: classId }],
      },
    });
  });
  await context.route(
    `**/api/platform/classes/${classId}/groups`,
    async (route) => {
      const body = route.request().postDataJSON();
      assert.equal(body.projectId, "vm-card");
      assert.equal(body.groupId, groupId);
      Object.assign(data.projects[0], {
        is_group_project: true,
        group_name: "Foxes",
      });
      await route.fulfill({ json: { ok: true } });
    },
  );
  await page.goto(origin);
  await page.getByRole("heading", { name: "Projects", exact: true }).waitFor();
  assert.equal(
    await page
      .getByText("Not assigned to a classroom", { exact: true })
      .count(),
    0,
  );
  const menu = () => page.locator('summary[aria-label^="Actions for"]');
  await menu().click();
  assert.equal(
    await page
      .getByRole("button", { name: "Make group project", exact: true })
      .count(),
    0,
  );
  await page.getByRole("heading", { name: "Projects", exact: true }).click();
  assert.equal(await page.locator("details[open]").count(), 0);
  await menu().click();
  await page
    .getByRole("button", { name: "Assign to classroom", exact: true })
    .click();
  await page.getByRole("button", { name: "Loading…", exact: true }).waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0);
  releaseClassrooms();
  await page.getByRole("checkbox", { name: "Creative classroom" }).waitFor();
  assert.equal(await page.getByRole("dialog").getByRole("status").count(), 0);
  await page.getByRole("checkbox", { name: "Creative classroom" }).check();
  await page.getByRole("button", { name: "Save sharing", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByText("Creative classroom", { exact: true }).waitFor();
  console.log(
    "PASS project menu closes outside, hides ineligible group action, and opens classroom modal only after loading",
  );
  await page.getByRole("heading", { name: "Projects", exact: true }).click();
  await menu().click();
  await page
    .getByRole("button", { name: "Rename project", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Description (optional)").inputValue(),
    "A puzzle adventure",
  );
  await page.getByLabel("Project name", { exact: true }).fill("Renamed game");
  await page.getByLabel("Description (optional)").fill("A new description");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page
    .getByRole("heading", { name: "Renamed game", exact: true })
    .waitFor();
  await page.getByText("A new description", { exact: true }).waitFor();
  assert.deepEqual(mutations, [
    { name: "Renamed game", description: "A new description" },
  ]);
  await page.getByRole("heading", { name: "Projects", exact: true }).click();
  await menu().click();
  await page
    .getByRole("button", { name: "Rename project", exact: true })
    .click();
  await page.getByRole("dialog").waitFor();
  await page
    .getByRole("heading", {
      name: "Projects",
      exact: true,
      includeHidden: true,
    })
    .click({ force: true });
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  console.log(
    "PASS project name and description save together and dialogs dismiss outside",
  );
  await menu().click();
  await page
    .getByRole("button", { name: "Make group project", exact: true })
    .click();
  await page
    .getByLabel("Classroom and group", { exact: true })
    .selectOption(groupId);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Make group project", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByText("Group project · Foxes", { exact: true }).waitFor();
  await page.getByRole("heading", { name: "Projects", exact: true }).click();
  await page.getByRole("article").click();
  await page.waitForURL(origin + "/vm-card/conversation");
  await page.getByRole("heading", { name: "Project workspace" }).waitFor();
  console.log(
    "PASS assigned group action refreshes project type; card body navigates without a footer link",
  );
} catch (error) {
  if (page)
    console.error("Fixture failure:", await page.locator("body").innerText());
  throw error;
} finally {
  if (browser) await browser.close();
  child.kill("SIGTERM");
  await new Promise((r) => child.once("exit", r));
  await rm(dir, { recursive: true, force: true });
}
