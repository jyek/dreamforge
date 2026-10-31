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
