import { adminHeaders, authorizeAdminRequest } from "@/lib/admin-auth";
import { database } from "@/lib/database";
import { serveProjectPreview } from "@/lib/serve-project-preview";
export const maxDuration = 60;
export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const access = await authorizeAdminRequest(req);
  if (access.response) return access.response;
  const { projectId } = await params;
  if (
    !/^vm-[a-z0-9]+$/.test(projectId) ||
    !(
      await database().query("select 1 from projects where vm_id=$1", [
        projectId,
      ])
    ).rowCount
  )
    return Response.json(
      { error: "Project not found." },
      { status: 404, headers: adminHeaders },
    );
  return serveProjectPreview(req, projectId);
}
