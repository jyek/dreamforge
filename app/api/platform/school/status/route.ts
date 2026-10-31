import { database } from "@/lib/database";
import { getProfile, platformEnabled } from "@/lib/platform-auth";
import { administeredSchool } from "@/lib/schools";
/** School identity for shared teacher and school-admin sidebars. */
export async function GET() {
  const user = platformEnabled() ? await getProfile() : null;
  if (user?.role !== "teacher") return Response.json({ schoolAdmin: false });
  return Response.json(
    {
      schoolAdmin: !!(await administeredSchool(database(), user.id)),
      schoolName: user.school_name || null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
