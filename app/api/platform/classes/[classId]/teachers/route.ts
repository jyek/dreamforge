import {
  getProfile,
  checkOrigin,
  inviteToken,
  tokenHash,
} from "@/lib/platform-auth";
import { classroomAccess } from "@/lib/classroom-data";
import { database } from "@/lib/database";
import { EmailNotConfiguredError, sendEmail } from "@/lib/email";
import { coTeacherInviteEmail, validEmail } from "@/lib/coteacher-invite-email";
const valid = (id: string) => /^[a-f0-9-]{36}$/i.test(id);
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ classId: string }> },
) {
  const user = await getProfile(),
    { classId } = await params;
  if (user?.role !== "teacher" || !valid(classId))
    return Response.json(
      { error: "Teacher access required." },
      { status: 403 },
    );
  const classroom = await classroomAccess(classId, user);
  if (!classroom)
    return Response.json({ error: "Classroom not found." }, { status: 404 });
  const { rows: teachers } = await database().query(
    `select pr.id,pr.display_name,pr.username,(pr.id=c.teacher_id) as is_owner from classes c join profiles pr on pr.id=c.teacher_id or exists(select 1 from class_teachers t where t.class_id=c.id and t.teacher_id=pr.id) where c.id=$1 order by (pr.id=c.teacher_id) desc,lower(pr.display_name)`,
    [classId],
  );
  const canManage = classroom.teacher_id === user.id;
  const { rows: invitations } = canManage
    ? await database().query(
        "select token_hash as id,expires_at from teacher_invites where classroom_id=$1 and used_at is null and expires_at>now() order by expires_at",
        [classId],
      )
    : { rows: [] };
  return Response.json({ teachers, canManage, invitations });
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ classId: string }> },
) {
  const user = await getProfile(),
    { classId } = await params;
  if (user?.role !== "teacher" || !checkOrigin(req) || !valid(classId))
    return Response.json({ error: "Not allowed." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const origin = process.env.DREAMFORGE_SITE_URL || new URL(req.url).origin;
  if (body.email === undefined) {
    const token = inviteToken();
    const { rowCount } = await database().query(
      "insert into teacher_invites(token_hash,created_by,classroom_id) select $1,$2,c.id from classes c where c.id=$3 and c.teacher_id=$2",
      [tokenHash(token), user.id, classId],
    );
    if (!rowCount)
      return Response.json(
        { error: "Only the classroom owner can invite teachers." },
        { status: 403 },
      );
    return Response.json({ link: `${origin}/classrooms/invite/${token}` });
  }
  // Email an invitation link the owner has already created for this classroom.
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!validEmail(email))
    return Response.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  if (
    typeof body.token !== "string" ||
    !/^[A-Za-z0-9_-]{20,100}$/.test(body.token)
  )
    return Response.json({ error: "Invalid invitation." }, { status: 400 });
  const { rowCount } = await database().query(
    "select 1 from teacher_invites i join classes c on c.id=i.classroom_id where i.token_hash=$1 and i.classroom_id=$2 and c.teacher_id=$3 and i.used_at is null and i.expires_at>now()",
    [tokenHash(body.token), classId, user.id],
  );
  if (!rowCount)
    return Response.json(
      {
        error:
          "This invitation has expired or was revoked. Add a co-teacher again.",
      },
      { status: 400 },
    );
  try {
    const classroom = await classroomAccess(classId, user);
    await sendEmail({
      to: email,
      ...coTeacherInviteEmail({
        inviterName: user.display_name,
        className: classroom?.name || "a classroom",
        link: `${origin}/classrooms/invite/${body.token}`,
      }),
    });
    return Response.json({ emailedTo: email });
  } catch (e) {
    console.error("coteacher.invite_email_failed", {
      errorType: e instanceof Error ? e.name : "Unknown",
    });
    return Response.json({
      emailError:
        e instanceof EmailNotConfiguredError
          ? "Email isn't set up yet. Copy the link and send it yourself."
          : "We couldn't send the email. Copy the link and send it yourself.",
    });
  }
}
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ classId: string }> },
) {
  const user = await getProfile(),
    { classId } = await params;
  if (user?.role !== "teacher" || !checkOrigin(req) || !valid(classId))
    return Response.json({ error: "Not allowed." }, { status: 403 });
  const body = await req.json().catch(() => ({})),
    db = await database().connect();
  try {
    await db.query("begin");
    const { rowCount } = await db.query(
      "select 1 from classes where id=$1 and teacher_id=$2 for update",
      [classId, user.id],
    );
    if (!rowCount) {
      await db.query("rollback");
      return Response.json(
        { error: "Only the classroom owner can manage teachers." },
        { status: 403 },
      );
    }
    if (
      typeof body.teacherId === "string" &&
      valid(body.teacherId) &&
      body.teacherId !== user.id
    )
      await db.query(
        "delete from class_teachers where class_id=$1 and teacher_id=$2",
        [classId, body.teacherId],
      );
    else if (
      typeof body.inviteId === "string" &&
      /^[a-f0-9]{64}$/.test(body.inviteId)
    )
      await db.query(
        "delete from teacher_invites where classroom_id=$1 and token_hash=$2 and used_at is null",
        [classId, body.inviteId],
      );
    else {
      await db.query("rollback");
      return Response.json(
        { error: "Choose a co-teacher or pending invitation." },
        { status: 400 },
      );
    }
    await db.query("commit");
    return Response.json({ ok: true });
  } catch (e) {
    await db.query("rollback");
    throw e;
  } finally {
    db.release();
  }
}
