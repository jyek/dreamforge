import { isPubliclyShowcased } from "@/lib/public-showcase";
import { serveProjectPreview } from "@/lib/serve-project-preview";
export const maxDuration = 60;
export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string; path?: string[] }> },
) {
  const { projectId, path = [] } = await params;
  if (
    !(await isPubliclyShowcased(projectId)) ||
    path.some((p) => !p || !/^[a-zA-Z0-9_-]+$/.test(p)) ||
    ["api", "_next"].includes((path[0] || "").toLowerCase())
  )
    return new Response("This project is not publicly showcased.", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  return serveProjectPreview(req, projectId, path, "showcase");
}
