import { createHash } from "node:crypto";
/** Always revalidate mutable dev assets. Never share a learner's cache via CDN. */
export function previewAssetEtag(body: string | ArrayBuffer) {
  const bytes = typeof body === "string" ? body : Buffer.from(body);
  return `"df-asset-v1-${createHash("sha256").update(bytes).digest("base64url")}"`;
}
export function matchesAssetEtag(header: string | null, etag: string) {
  return !!header
    ?.split(",")
    .some((value) => value.trim().replace(/^W\//, "") === etag);
}
