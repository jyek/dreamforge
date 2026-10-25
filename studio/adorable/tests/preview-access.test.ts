import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assetCapability,
  validAssetCapability,
  previewAssetPath,
  rewritePreview,
  previewCsp,
} from "../lib/preview-access";
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
