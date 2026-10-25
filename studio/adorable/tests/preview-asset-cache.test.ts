import { test } from "node:test";
import assert from "node:assert/strict";
import { previewAssetEtag, matchesAssetEtag } from "../lib/preview-asset-cache";
import { assetCapability, validAssetCapability } from "../lib/preview-access";
test("validators match unchanged rewritten bytes and reject changed files", () => {
  const etag = previewAssetEtag("const score = 1;");
  assert(matchesAssetEtag(etag, etag));
  assert(matchesAssetEtag(`"other", W/${etag}`, etag));
  assert(!matchesAssetEtag(null, etag));
  assert(!matchesAssetEtag(etag, previewAssetEtag("const score = 2;")));
  assert.equal(
    etag,
    previewAssetEtag(new TextEncoder().encode("const score = 1;").buffer),
  );
});
test("asset URLs remain stable within one minute and expired tokens are rejected", () => {
  const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const now = Date.now;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "cache-fixture";
  try {
    let time = 1800000000000;
    Date.now = () => time;
    const token = assetCapability("fixture");
    time += 59000;
    assert.equal(assetCapability("fixture"), token);
    assert(validAssetCapability("fixture", token));
    time += 1000;
    assert.notEqual(assetCapability("fixture"), token);
    time += 15 * 60000;
    assert(!validAssetCapability("fixture", token));
  } finally {
    Date.now = now;
    if (previous === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
  }
});
