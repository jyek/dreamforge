import { authorizeProject } from "@/lib/project-access";
import { runtimePreview } from "@/lib/project-runtime";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  if (!(await authorizeProject(projectId)))
    return Response.json({ error: "Project not found" }, { status: 404 });
  const preview = await runtimePreview(projectId, true);
  return Response.json(
    { url: preview.url, expiresAt: preview.expiresAt },
    { headers: { "Cache-Control": "no-store" } },
  );
}
