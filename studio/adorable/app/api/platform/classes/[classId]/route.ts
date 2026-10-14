import { getProfile, platformEnabled, checkOrigin } from "@/lib/platform-auth";
import { classroomData, assignClassroomProject } from "@/lib/classroom-data";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ classId: string }> },
) {
  const user = platformEnabled() ? await getProfile() : null;
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { classId } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(classId))
    return Response.json({ error: "Invalid classroom." }, { status: 400 });
  const data = await classroomData(classId, user);
  return data
    ? Response.json(data)
    : Response.json({ error: "Classroom not found." }, { status: 404 });
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ classId: string }> },
) {
  const user = platformEnabled() ? await getProfile() : null;
  if (!user || !checkOrigin(req))
    return Response.json({ error: "Not allowed." }, { status: 403 });
  const { classId } = await params;
  const body = await req.json().catch(() => ({}));
  if (
    !/^[a-f0-9-]{36}$/i.test(classId) ||
    !/^vm-[a-z0-9]+$/.test(body.projectId) ||
    !["assign", "remove"].includes(body.action)
  )
    return Response.json({ error: "Invalid assignment." }, { status: 400 });
  const ok = await assignClassroomProject(
    classId,
    body.projectId,
    user,
    body.action === "remove",
  );
  return ok
    ? Response.json({ ok: true })
    : Response.json(
        {
          error:
            "You can only assign your own projects to a classroom you belong to.",
        },
        { status: 403 },
      );
}
