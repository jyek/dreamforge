import { adminHeaders, authorizeAdminRequest } from "@/lib/admin-auth";
import { database } from "@/lib/database";
import { createSchool, listSchools } from "@/lib/school-admin";
/** Platform administrators add schools and invite each school's first admin. */
export async function GET(req: Request) {
  const access = await authorizeAdminRequest(req);
  if (access.response) return access.response;
  return Response.json(
    { schools: await listSchools(database()) },
    { headers: adminHeaders },
  );
}
export async function POST(req: Request) {
  const access = await authorizeAdminRequest(req);
  if (access.response) return access.response;
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 120)
    return Response.json(
      { error: "Enter the school's name (up to 120 characters)." },
      { status: 400, headers: adminHeaders },
    );
  const { school, token } = await createSchool(database(), {
    name,
    createdBy: access.user!.id,
  });
  return Response.json(
    {
      school,
      adminInviteLink: `${process.env.DREAMFORGE_SITE_URL || new URL(req.url).origin}/signup?teacherInvite=${token}`,
      schools: await listSchools(database()),
    },
    { headers: adminHeaders },
  );
}
