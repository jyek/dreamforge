import { authorizeProject } from "@/lib/project-access";
import { serveProjectPreview } from "@/lib/serve-project-preview";
export const maxDuration = 60;
export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string; path?: string[] }> },
) {
  const { projectId, path = [] } = await params;
  if (
    !/^vm-[a-z0-9]+$/.test(projectId) ||
    !(await authorizeProject(projectId, true))
  )
    return new Response("Project access required.", { status: 403 });
  if (
    path.some(
      (p) =>
        !p || p === ".." || p.startsWith(".") || !/^[a-zA-Z0-9_-]+$/.test(p),
    )
  )
    return new Response("Invalid preview path.", { status: 400 });
  return serveProjectPreview(req, projectId, path);
}
