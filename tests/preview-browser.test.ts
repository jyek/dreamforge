// @suite browser
import { bounded } from "../lib/bounded";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chromium } from "playwright-core";
import {
  assetCapability,
  validAssetCapability,
  previewAssetPath,
  rewritePreview,
  previewCsp,
} from "../lib/preview-access";
test("browser preview stays interactive in an opaque frame and its entry requires a login", async () => {
  const prior = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "preview-fixture";
  const project = "vm-fixture",
    cap = assetCapability(project),
    requests: { path: string; cookie?: string }[] = [];
  const server = createServer((req, res) => {
    const pathname = new URL(req.url!, "http://fixture").pathname;
    requests.push({ path: pathname, cookie: req.headers.cookie });
    res.setHeader("Content-Type", "text/html");
    const origin = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
    if (pathname === "/") {
      res.setHeader("Set-Cookie", "fixture=yes; HttpOnly; SameSite=Strict");
      res.end(
        `<iframe sandbox="allow-scripts allow-same-origin" src="/api/projects/${project}/preview/"></iframe>`,
      );
      return;
    }
    if (pathname === `/api/projects/${project}/preview/`) {
      if (req.headers.cookie !== "fixture=yes") {
        res.writeHead(403);
        res.end("Login required");
        return;
      }
      res.setHeader("Content-Security-Policy", previewCsp(origin));
      res.end(
        rewritePreview(
          '<button id="add">Add one</button><p id="score">0</p><script src="/_next/static/app.js" defer></script>',
          project,
          cap,
          true,
        ),
      );
      return;
    }
    const prefix = `/api/projects/${project}/preview-assets/`;
    if (pathname.startsWith(prefix)) {
      const [token, ...parts] = pathname.slice(prefix.length).split("/"),
        asset = "/" + parts.join("/");
      if (
        !validAssetCapability(project, token) ||
        !previewAssetPath(asset) ||
        !asset.endsWith(".js")
      ) {
        res.writeHead(403);
        res.end();
        return;
      }
      res.setHeader("Content-Type", "text/javascript");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.end(
        "let count=0;document.querySelector('#add').onclick=()=>document.querySelector('#score').textContent=String(++count);try{parent.document.body.dataset.escaped='yes'}catch{document.body.dataset.isolated='yes'}",
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
  const browser = await chromium.launch({
    executablePath:
      process.env.TEST_BROWSER_EXECUTABLE ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  try {
    const context = await bounded(browser.newContext(), 10000);
    const page = await bounded(context.newPage(), 10000);
    await page.goto(origin);
    const frame = page.frameLocator("iframe");
    // The button exists before the deferred fixture script installs its handler.
    await frame.locator('body[data-isolated="yes"]').waitFor();
    await frame.getByRole("button", { name: "Add one" }).click();
    // Browser input dispatch and renderer updates can complete after click resolves.
    await frame.locator('#score').filter({hasText: /^1$/}).waitFor();
    assert.equal(await frame.locator("#score").innerText(), "1");
    assert.equal(
      await frame.locator("body").getAttribute("data-isolated"),
      "yes",
    );
    assert.equal(await page.locator("body").getAttribute("data-escaped"), null);
    const anonymous = await bounded(browser.newContext(), 10000);
    const external = await bounded(anonymous.newPage(), 10000);
    const r = await external.goto(`${origin}/api/projects/${project}/preview/`);
    assert.equal(r?.status(), 403);
    assert.equal(
      requests.find((r) => r.path.endsWith("/app.js"))?.cookie,
      undefined,
    );
    assert.ok(!requests.some((r) => r.path.includes("runtime-preview-token")));
  } finally {
    await bounded(browser.close(), 5000);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (prior === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = prior;
  }
});
