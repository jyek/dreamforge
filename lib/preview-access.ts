import { PREVIEW_READY_MESSAGE } from "./preview-ready";
import { PROJECT_CONTENT_POLICY } from "./project-content-policy";
import { createHmac, timingSafeEqual } from "node:crypto";
export const previewEntryPath = (project: string) =>
  `/api/projects/${project}/preview/`;
export function browserPreviewUrl(project: string, requestUrl?: string) {
  const origin =
    (requestUrl ? new URL(requestUrl).origin : undefined) ||
    process.env.DREAMFORGE_SITE_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");
  return new URL(previewEntryPath(project), origin).toString();
}
function signature(project: string, expires: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw Error("Preview signing is not configured.");
  return createHmac("sha256", secret)
    .update(`dreamforge-assets-v1:${project}:${expires}`)
    .digest("base64url");
}
export function assetCapability(project: string) {
  const expires = String(Math.floor(Date.now() / 60000) * 60000 + 15 * 60000);
  return `${expires}.${signature(project, expires)}`;
}
export function validAssetCapability(project: string, token: string) {
  try {
    const [expires, sig] = token.split(".");
    if (
      !/^\d+$/.test(expires) ||
      Number(expires) < Date.now() ||
      Number(expires) > Date.now() + 16 * 60000
    )
      return false;
    const expected = signature(project, expires);
    return (
      expected.length === sig?.length &&
      timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    );
  } catch {
    return false;
  }
}
export function previewAssetPath(path: string) {
  return (
    path.startsWith("/_next/static/") ||
    /^\/[A-Za-z0-9_/-]+\.(?:css|js|mjs|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|mp3|wav)$/.test(
      path,
    )
  );
}
export function rewritePreview(
  text: string,
  project: string,
  capability: string,
  html = false,
) {
  const prefix = `/api/projects/${project}/preview-assets/${capability}`;
  let result = text.replaceAll("/_next/", `${prefix}/_next/`);
  if (html)
    result = result.replace(
      /\b(src|href)=(['"])\/(?!api\/projects\/)([^'"]*)\2/g,
      (all, attribute, quote, path) =>
        previewAssetPath("/" + path)
          ? `${attribute}=${quote}${prefix}/${path}${quote}`
          : all,
    );
  result = result.replace(
    /(?<![A-Za-z0-9/])\/(?!api\/projects\/)([A-Za-z0-9_/-]+\.(?:png|jpe?g|gif|svg|webp|ico|woff2?|ttf|mp3|wav))/g,
    (_all, path) => `${prefix}/${path}`,
  );
  result = result.replace(
    /url\((['"]?)\/(?!api\/projects\/)([^)'"\s]+)\1\)/g,
    (_all, quote, path) => `url(${quote}${prefix}/${path}${quote})`,
  );
  if (html && !result.includes("data-dreamforge-preview-ready")) {
    // Signal after the HTML is parsed, without waiting for slow remote assets.
    // The parent accepts this only from its current iframe; it is not test evidence.
    const ready = `<script data-dreamforge-preview-ready>if(window.parent!==window)window.parent.postMessage({type:${JSON.stringify(PREVIEW_READY_MESSAGE)}},"*");</script>`;
    result = /<\/body\s*>/i.test(result)
      ? result.replace(/<\/body\s*>/i, ready + "</body>")
      : result + ready;
  }
  return result;
}
export function previewCsp(origin: string) {
  return `sandbox allow-scripts allow-forms allow-popups allow-downloads; ${PROJECT_CONTENT_POLICY}; base-uri ${origin}; frame-ancestors 'self'`;
}
