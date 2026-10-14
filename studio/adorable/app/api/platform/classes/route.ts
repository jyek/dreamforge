import { database } from "@/lib/database";
import {
  checkOrigin,
  getProfile,
  inviteToken,
  platformEnabled,
  tokenHash,
} from "@/lib/platform-auth";
export async function POST(req: Request) {
  if (!platformEnabled() || !checkOrigin(req))
    return Response.json({ error: "Unavailable" }, { status: 403 });
  const user = await getProfile();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body.action === "inviteTeacher" && user.role === "teacher") {
    const token = inviteToken();
    await database().query(
      "insert into adorable.teacher_invites(token_hash,created_by) values($1,$2)",
      [tokenHash(token), user.id],
    );
    return Response.json({
      link: `${process.env.DREAMFORGE_SITE_URL || new URL(req.url).origin}/signup?teacherInvite=${token}`,
    });
  }
  if (user.role === "teacher") {
    const name =
      typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
    if (!name)
      return Response.json({ error: "Name your class." }, { status: 400 });
    const code = inviteToken().slice(0, 12).toUpperCase();
    const { rows } = await database().query(
      "insert into adorable.classes(teacher_id,name,invite_code) values($1,$2,$3) returning id,name,invite_code",
      [user.id, name, code],
    );
    return Response.json({ class: rows[0] });
  }
  const code =
    typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  const { rows } = await database().query(
    "select id from adorable.classes where invite_code=$1",
    [code],
  );
  if (!rows[0])
    return Response.json({ error: "Class code not found." }, { status: 400 });
  await database().query(
    "insert into adorable.class_members(class_id,child_id) values($1,$2) on conflict do nothing",
    [rows[0].id, user.id],
  );
  return Response.json({ ok: true });
}
