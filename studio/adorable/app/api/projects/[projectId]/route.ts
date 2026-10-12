import { authorizeProject } from "@/lib/project-access";
import { renameProject } from "@/lib/project-storage";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  if (!/^vm-[a-z0-9]+$/.test(projectId))
    return Response.json({ error: "Invalid project" }, { status: 400 });
  if (!(await authorizeProject(projectId)))
    return Response.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name))
    return Response.json(
      {
        error:
          "Enter a project name between 1 and 80 characters, without control characters.",
      },
      { status: 400 },
    );
  const metadata = await renameProject(projectId, name);
  return Response.json({ name: metadata.name });
}
