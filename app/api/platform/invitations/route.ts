import { database } from "@/lib/database";
import { getProfile, checkOrigin, platformEnabled } from "@/lib/platform-auth";
import { listInvitations, revokeInvitation } from "@/lib/invitations";
export async function GET(req: Request) {
  const user = platformEnabled() ? await getProfile() : null;
  if (user?.role !== "teacher")
    return Response.json({ error: "Staff access required." }, { status: 403 });
  const role = new URL(req.url).searchParams.get("role");
  if (role !== "teacher" && role !== "student")
    return Response.json(
      { error: "Choose an invitation type." },
      { status: 400 },
    );
  return Response.json(
    { invitations: await listInvitations(database(), user.id, role) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
export async function DELETE(req: Request) {
  const user = platformEnabled() ? await getProfile() : null;
  if (user?.role !== "teacher" || !checkOrigin(req))
    return Response.json({ error: "Staff access required." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (
    !["teacher", "student"].includes(b.role) ||
    typeof b.id !== "string" ||
    !/^[a-f0-9]{64}$/.test(b.id)
  )
    return Response.json({ error: "Invalid invitation." }, { status: 400 });
  return (await revokeInvitation(database(), user.id, b.role, b.id))
    ? Response.json({ ok: true })
    : Response.json(
        { error: "Invitation not found or already inactive." },
        { status: 404 },
      );
}
