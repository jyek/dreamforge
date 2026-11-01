// @suite browser
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chromium } from "playwright-core";
import { waitForPreviewReady } from "../scripts/e2e-preview-ready.mjs";

test("preview readiness waits for delayed client handlers after each reload", async () => {
  let release, requested;
  let gate, resourceRequested;
  function resetGate() {
    gate = new Promise((resolve) => {
      release = resolve;
    });
    resourceRequested = new Promise((resolve) => {
      requested = resolve;
    });
  }
  resetGate();
  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.url === "/") {
      res.setHeader("Content-Type", "text/html");
      return res.end('<iframe src="/counter"></iframe>');
    }
    if (req.url === "/counter") {
      res.setHeader("Content-Type", "text/html");
      return res.end(
        '<h1>Delayed counter</h1><output>0</output><button>Add one</button><script src="/handlers.js" defer></script>',
      );
    }
    if (req.url === "/handlers.js") {
      requested();
      await gate;
      res.setHeader("Content-Type", "application/javascript");
      return res.end(
        "document.querySelector('button').onclick=()=>{const score=document.querySelector('output');score.textContent=Number(score.textContent)+1;};",
      );
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({
      executablePath:
        process.env.TEST_BROWSER_EXECUTABLE ||
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      headless: true,
      args: ["--no-sandbox"],
    });
    const page = await browser.newPage();
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt) resetGate();
      await page.goto(origin, { waitUntil: "commit" });
      await resourceRequested;
      const frame = page.frameLocator("iframe").first();
      await frame.getByRole("heading", { name: "Delayed counter" }).waitFor();
      // Visible SSR controls have no handler yet; a heading alone is not readiness.
      await frame.getByRole("button", { name: "Add one" }).click();
      assert.equal(await frame.locator("output").textContent(), "0");
      let ready = false;
      const pending = waitForPreviewReady(page, "Delayed counter").then((f) => {
        ready = true;
        return f;
      });
      // Let the readiness check observe the heading while the script stays held.
      assert.equal(await frame.locator("output").textContent(), "0");
      assert.equal(ready, false);
      release();
      const settled = await pending;
      await settled.getByRole("button", { name: "Add one" }).click();
      await settled.getByText("1", { exact: true }).waitFor();
    }
  } finally {
    release();
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
