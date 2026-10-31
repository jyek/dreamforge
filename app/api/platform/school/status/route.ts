import { database } from "@/lib/database";
import { getProfile, platformEnabled } from "@/lib/platform-auth";
import { administeredSchool } from "@/lib/schools";
/** Lets the teacher sidebar know whether to show the School section. */
export async function GET() {
  const user = platformEnabled() ? await getProfile() : null;
  if (user?.role !== "teacher") return Response.json({ schoolAdmin: false });
  return Response.json({
    schoolAdmin: !!(await administeredSchool(database(), user.id)),
  });
}
