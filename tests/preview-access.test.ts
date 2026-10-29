import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assetCapability,
  validAssetCapability,
  previewAssetPath,
  rewritePreview,
  previewCsp,
  browserPreviewUrl,
} from "../lib/preview-access";
test("authenticated preview links follow the current domain after a domain change", () => {
  const previous = process.env.DREAMFORGE_SITE_URL;
  process.env.DREAMFORGE_SITE_URL = "https://retired.vercel.app";
  try {
    assert.equal(
      browserPreviewUrl(
        "vm-fixture",
        "https://dreamforge2.vercel.app/api/projects?projectId=vm-fixture",
      ),
      "https://dreamforge2.vercel.app/api/projects/vm-fixture/preview/",
    );
    assert.equal(
      browserPreviewUrl("vm-fixture", "http://localhost:3000/api/projects"),
      "http://localhost:3000/api/projects/vm-fixture/preview/",
    );
  } finally {
    if (previous === undefined) delete process.env.DREAMFORGE_SITE_URL;
    else process.env.DREAMFORGE_SITE_URL = previous;
  }
});
test("asset capabilities are project-scoped, tamper-resistant and never authorize HTML or APIs", () => {
  const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-secret";
  try {
    const cap = assetCapability("vm-fixture");
    assert.equal(validAssetCapability("vm-fixture", cap), true);
    assert.equal(validAssetCapability("vm-other", cap), false);
    assert.equal(validAssetCapability("vm-fixture", cap + "x"), false);
    for (const path of [
      "/",
      "/index.html",
      "/api/chat",
      "/.env",
      "/app/page.tsx",
    ])
      assert.equal(previewAssetPath(path), false);
    assert.equal(previewAssetPath("/_next/static/chunks/app.js"), true);
    const html = rewritePreview(
      '<script src="/_next/static/chunks/app.js"></script><img src="/logo.svg">',
      "vm-fixture",
      cap,
      true,
    );
    assert.ok(html.includes(`/preview-assets/${cap}/_next/`));
    assert.ok(!html.includes("x-runtime-preview-token"));
    assert.ok(
      previewCsp("https://app.test").includes("sandbox allow-scripts "),
    );
    assert.ok(!previewCsp("https://app.test").includes("allow-same-origin"));
  } finally {
    if (previous === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
  }
});

test("preview HTML signals display readiness once, independently of slow assets", () => {
  const page = rewritePreview(
    '<html><body><h1>Ready</h1><img src="https://assets.invalid/slow.png"></body></html>',
    "vm-fixture",
    "fixture",
    true,
  );
  assert.match(page, /data-dreamforge-preview-ready/);
  assert.match(page, /dreamforge:preview-html-ready/);
  assert.equal(
    page.indexOf("data-dreamforge-preview-ready") < page.indexOf("</body>"),
    true,
  );
  assert.equal(
    rewritePreview(page, "vm-fixture", "fixture", true).match(
      /data-dreamforge-preview-ready/g,
    )?.length,
    1,
  );
  assert.doesNotMatch(
    rewritePreview("body {}", "vm-fixture", "fixture"),
    /preview-html-ready/,
  );
});
test("preview display signals require the currently attached iframe", async () => {
  const { isPreviewReadyMessage, PREVIEW_READY_MESSAGE } =
    await import("../lib/preview-ready");
  const frame = {} as Window;
  assert.equal(
    isPreviewReadyMessage(
      { source: frame, data: { type: PREVIEW_READY_MESSAGE } },
      frame,
    ),
    true,
  );
  assert.equal(
    isPreviewReadyMessage(
      { source: {} as Window, data: { type: PREVIEW_READY_MESSAGE } },
      frame,
    ),
    false,
  );
  assert.equal(
    isPreviewReadyMessage(
      { source: null, data: { type: PREVIEW_READY_MESSAGE } },
      null,
    ),
    false,
  );
  assert.equal(
    isPreviewReadyMessage({ source: frame, data: { type: "other" } }, frame),
    false,
  );
});

test("public asset capabilities cannot be changed into private workspace capabilities", () => {
  const before = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "showcase-signing-fixture";
  try {
    const publicCap = assetCapability("vm-fixture", "showcase");
    const privateCap = assetCapability("vm-fixture");
    assert.equal(validAssetCapability("vm-fixture", publicCap), true);
    assert.equal(
      validAssetCapability("vm-fixture", publicCap.replace(/^showcase\./, "")),
      false,
    );
    assert.equal(
      validAssetCapability("vm-fixture", "showcase." + privateCap),
      false,
    );
    assert.equal(validAssetCapability("vm-other", publicCap), false);
  } finally {
    if (before === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = before;
  }
});
