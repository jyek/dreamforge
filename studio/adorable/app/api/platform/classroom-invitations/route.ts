import { getProfile, checkOrigin } from "@/lib/platform-auth";
import { acceptClassroomTeacherInvite } from "@/lib/classroom-teachers";
export async function POST(req: Request) {
  const user = await getProfile();
  if (user?.role !== "teacher" || !checkOrigin(req))
    return Response.json(
      { error: "Sign in to a teacher account to join." },
      { status: 403 },
    );
  const body = await req.json().catch(() => ({}));
  const classId = await acceptClassroomTeacherInvite(body.token, user);
  return classId
    ? Response.json({ classId })
    : Response.json(
        {
          error:
            "This invitation is invalid, expired, revoked or already used.",
        },
        { status: 400 },
      );
}
