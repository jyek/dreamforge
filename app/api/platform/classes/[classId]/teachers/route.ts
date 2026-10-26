import {
  getProfile,
  checkOrigin,
  inviteToken,
  tokenHash,
} from "@/lib/platform-auth";
import { classroomAccess } from "@/lib/classroom-data";
import { database } from "@/lib/database";
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
  return Response.json({
    link: `${process.env.DREAMFORGE_SITE_URL || new URL(req.url).origin}/classrooms/invite/${token}`,
  });
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
