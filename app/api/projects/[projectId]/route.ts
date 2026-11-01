import { authorizeProject } from "@/lib/project-access";
import { projectDetailsPatch } from "@/lib/project-details";
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
  let details;
  try {
    details = projectDetailsPatch(body);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
  const metadata = await renameProject(
    projectId,
    details.name,
    details.description,
  );
  return Response.json({
    name: metadata.name,
    description: metadata.description || "",
  });
}
