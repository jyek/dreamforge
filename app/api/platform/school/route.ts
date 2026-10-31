import { database } from "@/lib/database";
import { checkOrigin, getProfile, platformEnabled } from "@/lib/platform-auth";
import { administeredSchool } from "@/lib/schools";
import { createSchoolTeacherInvite, schoolOverview } from "@/lib/school-admin";
async function schoolAdmin() {
  const user = platformEnabled() ? await getProfile() : null;
  if (user?.role !== "teacher") return null;
  const schoolId = await administeredSchool(database(), user.id);
  return schoolId ? { user, schoolId } : null;
}
const denied = () =>
  Response.json(
    { error: "School administrator access required." },
    { status: 403 },
  );
export async function GET() {
  const admin = await schoolAdmin();
  if (!admin) return denied();
  return Response.json(await schoolOverview(database(), admin.schoolId));
}
/** A school administrator invites a teacher (or another administrator) into their school. */
export async function POST(req: Request) {
  const admin = await schoolAdmin();
  if (!admin || !checkOrigin(req)) return denied();
  const body = await req.json().catch(() => ({}));
  const token = await createSchoolTeacherInvite(database(), {
    schoolId: admin.schoolId,
    createdBy: admin.user.id,
    makeAdmin: body.admin === true,
  });
  return Response.json({
    link: `${process.env.DREAMFORGE_SITE_URL || new URL(req.url).origin}/signup?teacherInvite=${token}`,
  });
}

export async function PATCH(req: Request) {
  const admin = await schoolAdmin();
  if (!admin || !checkOrigin(req)) return denied();
  const body = await req.json().catch(() => ({}));
  if (!body || typeof body !== "object" || Array.isArray(body))
    return Response.json({ error: "Invalid setup request." }, { status: 400 });
  const { setupSchool } = await import("@/lib/school-setup");
  const ok = await setupSchool(database(), admin.user.id, admin.schoolId, body);
  return ok
    ? Response.json({ ok: true })
    : Response.json(
        {
          error:
            "Choose a valid classroom and person in your school. They may already be assigned.",
        },
        { status: 400 },
      );
}
