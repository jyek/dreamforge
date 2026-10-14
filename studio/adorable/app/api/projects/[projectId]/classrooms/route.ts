import { database } from "@/lib/database";
import { getProfile, checkOrigin } from "@/lib/platform-auth";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getProfile(),
    { projectId } = await params;
  if (user?.role !== "teacher")
    return Response.json(
      { error: "Teacher access required." },
      { status: 403 },
    );
  const db = database();
  const { rowCount } = await db.query(
    "select 1 from adorable.projects where vm_id=$1 and owner_id=$2 and not is_example",
    [projectId, user.id],
  );
  if (!rowCount)
    return Response.json({ error: "Project not found." }, { status: 404 });
  const { rows } = await db.query(
    "select c.id,c.name,exists(select 1 from adorable.project_classrooms pc where pc.class_id=c.id and pc.vm_id=$2) as attached from adorable.classes c where c.teacher_id=$1 order by c.created_at",
    [user.id, projectId],
  );
  return Response.json({ classes: rows });
}
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getProfile(),
    { projectId } = await params;
  if (user?.role !== "teacher" || !checkOrigin(req))
    return Response.json(
      { error: "Teacher access required." },
      { status: 403 },
    );
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
      "select 1 from adorable.projects where vm_id=$1 and owner_id=$2 and not is_example for update",
      [projectId, user.id],
    );
    if (!rowCount) {
      await db.query("rollback");
      return Response.json({ error: "Project not found." }, { status: 404 });
    }
    const classes = await db.query(
      "select id from adorable.classes where teacher_id=$1 and id=any($2::uuid[]) for share",
      [user.id, unique],
    );
    if (classes.rows.length !== unique.length) {
      await db.query("rollback");
      return Response.json(
        { error: "Choose your own classrooms." },
        { status: 403 },
      );
    }
    await db.query("delete from adorable.project_classrooms where vm_id=$1", [
      projectId,
    ]);
    await db.query(
      "insert into adorable.project_classrooms(vm_id,class_id) select $1,unnest($2::uuid[])",
      [projectId, unique],
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
