import { adminHeaders, authorizeAdminRequest } from "@/lib/admin-auth";
import {
  AdminShowcaseError,
  changeShowcase,
  loadAdminProjects,
} from "@/lib/admin-showcase";
export const maxDuration = 300;
export async function GET(req: Request) {
  const access = await authorizeAdminRequest(req);
  if (access.response) return access.response;
  return Response.json(
    { projects: await loadAdminProjects(access.user!.id) },
    { headers: adminHeaders },
  );
}
export async function POST(req: Request) {
  const access = await authorizeAdminRequest(req);
  if (access.response) return access.response;
  try {
    const body = await req.json().catch(() => null);
    if (!body)
      return Response.json(
        { error: "Send a valid request." },
        { status: 400, headers: adminHeaders },
      );
    await changeShowcase(
      access.user!.id,
      body.action,
      body.projectId,
      body.projectIds,
    );
    return Response.json(
      { projects: await loadAdminProjects(access.user!.id) },
      { headers: adminHeaders },
    );
  } catch (error) {
    if (error instanceof AdminShowcaseError)
      return Response.json(
        { error: error.message },
        { status: error.status, headers: adminHeaders },
      );
    console.error("admin.showcase.failed", {
      code: (error as { code?: string }).code,
    });
    return Response.json(
      {
        error:
          "The showcase could not be updated. Your original projects are unchanged. Please reload and try again.",
      },
      { status: 503, headers: adminHeaders },
    );
  }
}
