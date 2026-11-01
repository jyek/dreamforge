import { classroomTeacherSQL } from "@/lib/classroom-permissions";
import { database } from "@/lib/database";
import { getProfile, checkOrigin } from "@/lib/platform-auth";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getProfile(),
    { projectId } = await params;
  if (!user)
    return Response.json({ error: "Sign in required." }, { status: 403 });
  const db = database();
  const { rowCount } = await db.query(
    "select 1 from projects where vm_id=$1 and owner_id=$2 and not is_example",
    [projectId, user.id],
  );
  if (!rowCount)
    return Response.json({ error: "Project not found." }, { status: 404 });
  const { rows } = await db.query(
    `select c.id,c.name,exists(select 1 from class_projects pc where pc.class_id=c.id and pc.vm_id=$2) as attached from classes c where ${user.role === "teacher" ? classroomTeacherSQL("c.id") : "exists(select 1 from class_members m where m.class_id=c.id and m.child_id=$1)"} order by c.created_at`,
    [user.id, projectId],
  );
  const groups =
    user.role === "child"
      ? (
          await db.query(
            `select g.id,g.name,g.class_id from classroom_groups g join classroom_group_members m on m.group_id=g.id join class_members cm on cm.class_id=g.class_id and cm.child_id=m.child_id where m.child_id=$1`,
            [user.id],
          )
        ).rows
      : [];
  return Response.json(
    { classes: rows, groups },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getProfile(),
    { projectId } = await params;
  if (!user || !checkOrigin(req))
    return Response.json({ error: "Sign in required." }, { status: 403 });
  const body = await req.json().catch(() => null),
    ids = body?.classIds;
  if (
    !Array.isArray(ids) ||
    ids.length > 50 ||
    ids.some((id) => typeof id !== "string" || !/^[a-f0-9-]{36}$/i.test(id))
  )
    return Response.json(
      { error: "Choose valid classrooms." },
      { status: 400 },
    );
  const unique = [...new Set(ids)];
  const db = await database().connect();
  try {
    await db.query("begin");
    const { rowCount } = await db.query(
      "select 1 from projects where vm_id=$1 and owner_id=$2 and not is_example for update",
      [projectId, user.id],
    );
    if (!rowCount) {
      await db.query("rollback");
      return Response.json({ error: "Project not found." }, { status: 404 });
    }
    const classes = await db.query(
      `select c.id from classes c where ${user.role === "teacher" ? classroomTeacherSQL("c.id") : "exists(select 1 from class_members m where m.class_id=c.id and m.child_id=$1)"} and c.id=any($2::uuid[]) for share`,
      [user.id, unique],
    );
    if (classes.rows.length !== unique.length) {
      await db.query("rollback");
      return Response.json(
        {
          error:
            user.role === "teacher"
              ? "Choose a classroom you facilitate."
              : "Choose a classroom you belong to.",
        },
        { status: 403 },
      );
    }
    const grouped = await db.query(
      "select group_class_id from projects where vm_id=$1 and classroom_group_id is not null",
      [projectId],
    );
    if (
      grouped.rows[0]?.group_class_id &&
      !unique.includes(grouped.rows[0].group_class_id)
    ) {
      await db.query("rollback");
      return Response.json(
        {
          error:
            "Keep the group’s classroom assigned while this is a group project.",
        },
        { status: 400 },
      );
    }
    await db.query("delete from class_projects where vm_id=$1", [projectId]);
    await db.query(
      "insert into class_projects(vm_id,class_id,assigned_by) select $1,unnest($2::uuid[]),$3",
      [projectId, unique, user.id],
    );
    await db.query("commit");
    return Response.json({ ok: true });
  } catch (e) {
    await db.query("rollback");
    throw e;
  } finally {
    db.release();
  }
}
