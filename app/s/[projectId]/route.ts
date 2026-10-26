import { safetyEnabled } from "@/lib/safety-mode";
import { database } from "@/lib/database";
import { runtimePreview } from "@/lib/project-runtime";
import { readProjectMetadata } from "@/lib/project-storage";
import { prodVm, startDevServer } from "@/lib/project-vm";
export const maxDuration = 60;
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  if (!/^vm-[a-z0-9]+$/.test(projectId))
    return new Response("Shared project not found.", { status: 404 });
  if (safetyEnabled()) {
    const {
      rows: [share],
    } = await database().query(
      "select url from approved_shares where project_id=$1 order by created_at desc limit 1",
      [projectId],
    );
    return share
      ? Response.redirect(share.url, 307)
      : new Response("This project needs teacher approval before sharing.", {
          status: 404,
        });
  }
  const metadata = await readProjectMetadata(projectId).catch(() => null);
  if (!metadata?.liveReleaseId)
    return new Response("This project has not been shared yet.", {
      status: 404,
    });
  let target =
    metadata.staticProductionUrl || `https://${metadata.productionDomain}`;
  if (metadata.staticProductionUrl) return Response.redirect(target, 307);
  if (!metadata.prodVmId)
    return new Response("The shared version is not ready yet.", {
      status: 503,
    });
  try {
    const preview = await runtimePreview(metadata.prodVmId);
    target = preview.url;
    const vm = prodVm(metadata.prodVmId);
    const info = await vm.data();
    if (info.state === "paused" || info.state === "stopped") await vm.start();
    if (info.state === "stopped") await startDevServer(vm);
    for (let attempt = 0; attempt < 10; attempt++) {
      const response = await fetch(preview.baseUrl, {
        headers: preview.token
          ? { "x-runtime-preview-token": preview.token }
          : {},
        signal: AbortSignal.timeout(3000),
        cache: "no-store",
      }).catch(() => null);
      if (response && response.status < 500)
        return Response.redirect(target, 307);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  } catch {}
  return new Response(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Opening shared app</title></head><body style="font-family:system-ui;max-width:32rem;margin:15vh auto;padding:24px"><h1>The app is still waking up</h1><p>Please try again in a moment.</p><a href="/s/${projectId}">Try again</a></body></html>`,
    {
      status: 503,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}
