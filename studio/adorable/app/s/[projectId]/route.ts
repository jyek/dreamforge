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
  const metadata = await readProjectMetadata(projectId).catch(() => null);
  if (!metadata?.liveReleaseId)
    return new Response("This project has not been shared yet.", {
      status: 404,
    });
  const target =
    metadata.staticProductionUrl || `https://${metadata.productionDomain}`;
  if (metadata.staticProductionUrl) return Response.redirect(target, 307);
  if (!metadata.prodVmId)
    return new Response("The shared version is not ready yet.", {
      status: 503,
    });
  try {
    const vm = prodVm(metadata.prodVmId);
    const info = await vm.data();
    if (info.state === "paused" || info.state === "stopped") await vm.start();
    if (info.state === "stopped") await startDevServer(vm);
    for (let attempt = 0; attempt < 10; attempt++) {
      const response = await fetch(target, {
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
