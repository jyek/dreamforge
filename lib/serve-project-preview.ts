import {
  fetchPreviewWithRecovery,
  previewPageFailure,
} from "@/lib/runtime-preview";
import { runtimePreview } from "@/lib/project-runtime";
import {
  assetCapability,
  previewCsp,
  rewritePreview,
} from "@/lib/preview-access";
export async function serveProjectPreview(
  req: Request,
  projectId: string,
  path: string[] = [],
  audience: "workspace" | "showcase" = "workspace",
) {
  try {
    let preview = await runtimePreview(projectId);
    const request = () =>
      fetch(
        new URL("/" + path.map(encodeURIComponent).join("/"), preview.baseUrl),
        {
          headers: preview.token
            ? { "x-runtime-preview-token": preview.token }
            : {},
          redirect: "error",
          cache: "no-store",
          signal: AbortSignal.timeout(30000),
        },
      );
    const upstream = await fetchPreviewWithRecovery(request, async () => {
      preview = await runtimePreview(projectId, true);
    });
    const failure = previewPageFailure(upstream);
    if (failure) {
      await upstream.body?.cancel();
      return new Response(failure.message, { status: failure.status });
    }
    const html = await upstream.text();
    if (html.length > 4000000) throw Error("Preview too large");
    return new Response(
      rewritePreview(
        html,
        projectId,
        assetCapability(projectId, audience),
        true,
      ),
      {
        status: upstream.status,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Security-Policy": previewCsp(new URL(req.url).origin),
          "Referrer-Policy": "no-referrer",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch {
    return new Response(
      "Preview is unavailable. Reopen the workspace to try again.",
      { status: 503 },
    );
  }
}
