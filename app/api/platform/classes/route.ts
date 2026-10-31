import { database } from "@/lib/database";
import {
  SCHOOL_MISMATCH_MESSAGE,
  administeredSchool,
  sameSchool,
  schoolOf,
} from "@/lib/schools";
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
    // Teachers in a school are added to it by the school administrator only.
    const school = await schoolOf(database(), user.id);
    if (school && (await administeredSchool(database(), user.id)) !== school)
      return Response.json(
        { error: "Ask your school administrator to add teachers." },
        { status: 403 },
      );
    const token = inviteToken();
    await database().query(
      "insert into teacher_invites(token_hash,created_by,school_id) values($1,$2,$3)",
      [tokenHash(token), user.id, school],
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
      "insert into classes(teacher_id,name,invite_code) values($1,$2,$3) returning id,name,invite_code",
      [user.id, name, code],
    );
    return Response.json({ class: rows[0] });
  }
  const code =
    typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  const { rows } = await database().query(
    "select c.id,t.school_id from classes c join profiles t on t.id=c.teacher_id where c.invite_code=$1",
    [code],
  );
  if (!rows[0])
    return Response.json(
      { error: "Class Number not found. Check it with your teacher." },
      { status: 400 },
    );
  if (!sameSchool(rows[0].school_id, await schoolOf(database(), user.id)))
    return Response.json({ error: SCHOOL_MISMATCH_MESSAGE }, { status: 403 });
  await database().query(
    "insert into class_members(class_id,child_id) values($1,$2) on conflict do nothing",
    [rows[0].id, user.id],
  );
  return Response.json({ ok: true });
}

async function manageClass(req: Request, remove = false) {
  const user = platformEnabled() ? await getProfile() : null;
  if (user?.role !== "teacher" || !checkOrigin(req))
    return Response.json(
      { error: "Teacher access required." },
      { status: 403 },
    );
  const body = await req.json().catch(() => ({}));
  if (typeof body.id !== "string" || !/^[a-f0-9-]{36}$/i.test(body.id))
    return Response.json({ error: "Invalid class." }, { status: 400 });
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (
    !remove &&
    (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name))
  )
    return Response.json(
      { error: "Use a class name of 1–80 characters." },
      { status: 400 },
    );
  try {
    const query = {
      text: remove
        ? "delete from classes where id=$1 and teacher_id=$2"
        : "update classes set name=$3 where id=$1 and teacher_id=$2",
      values: remove ? [body.id, user.id] : [body.id, user.id, name],
      query_timeout: 15000,
    };
    const { rowCount } = await database().query(query);
    if (!rowCount)
      return Response.json({ error: "Class not found." }, { status: 404 });
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Could not update your class. Please refresh and try again." },
      { status: 503 },
    );
  }
}
export async function PATCH(req: Request) {
  return manageClass(req);
}
export async function DELETE(req: Request) {
  return manageClass(req, true);
}
