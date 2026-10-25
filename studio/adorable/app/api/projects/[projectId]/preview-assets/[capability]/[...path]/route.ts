import { previewAssetEtag, matchesAssetEtag } from "@/lib/preview-asset-cache";
import { runtimePreview } from "@/lib/project-runtime";
import {
  previewAssetPath,
  validAssetCapability,
  rewritePreview,
} from "@/lib/preview-access";
/** Asset-only capability: never serves an HTML entry, API, source file or runtime credential. */
export async function GET(
  _req: Request,
  {
    params,
  }: {
    params: Promise<{ projectId: string; capability: string; path: string[] }>;
  },
) {
  const { projectId, capability, path } = await params;
  const asset = "/" + path.join("/");
  if (
    !/^vm-[a-z0-9]+$/.test(projectId) ||
    !validAssetCapability(projectId, capability) ||
    !previewAssetPath(asset) ||
    path.some((p) => !p || p === ".." || p === "." || p.includes("\\"))
  )
    return new Response("Asset unavailable.", { status: 403 });
  try {
    const preview = await runtimePreview(projectId);
    const upstream = await fetch(new URL(asset, preview.baseUrl), {
      headers: preview.token
        ? { "x-runtime-preview-token": preview.token }
        : {},
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    const type =
      upstream.headers.get("content-type") || "application/octet-stream";
    if (/html|json/i.test(type))
      return new Response("Asset unavailable.", { status: 403 });
    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength > 8 * 1024 * 1024) throw Error("Asset too large");
    const body = /javascript|text\/css/.test(type)
      ? rewritePreview(new TextDecoder().decode(bytes), projectId, capability)
      : bytes;
    const etag = upstream.ok ? previewAssetEtag(body) : null;
    const unchanged =
      etag && matchesAssetEtag(_req.headers.get("if-none-match"), etag);
    return new Response(unchanged ? null : body, {
      status: unchanged ? 304 : upstream.status,
      headers: {
        ...(etag ? { ETag: etag } : {}),
        "Content-Type": type,
        "Cache-Control": upstream.ok
          ? "private, no-cache, must-revalidate"
          : "no-store",
        "Access-Control-Allow-Origin": "*",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "sandbox; default-src 'none'; style-src 'unsafe-inline'",
      },
    });
  } catch {
    return new Response("Asset unavailable.", { status: 503 });
  }
}
