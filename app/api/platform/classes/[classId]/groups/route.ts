import { database } from "@/lib/database";
import { getProfile, platformEnabled, checkOrigin } from "@/lib/platform-auth";
import { groupManagerSQL } from "@/lib/project-group";
import {
  changeClassroomGroups,
  ClassroomGroupError,
} from "@/lib/classroom-groups";
async function readGroups(
  _req: Request,
  { params }: { params: Promise<{ classId: string }> },
) {
  const user = platformEnabled() ? await getProfile() : null;
  if (!user || user.role !== "teacher")
    return Response.json({ error: "Staff access required." }, { status: 403 });
  const { classId } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(classId))
    return Response.json({ error: "Invalid classroom." }, { status: 400 });
  const db = database();
  const authorized = await db.query(
    `select 1 from classes c where c.id=$1 and ${groupManagerSQL("c.id", "$2")}`,
    [classId, user.id],
  );
  if (!authorized.rowCount)
    return Response.json({ error: "Classroom not found." }, { status: 404 });
  const { rows } = await db.query(
    `select p.vm_id as id,p.classroom_group_id as group_id,p.metadata->>'name' as name,p.owner_id,pr.display_name as owner,p.metadata->'conversations'->0->>'id' as conversation_id, array(select pm.child_id::text from project_members pm where pm.vm_id=p.vm_id and p.group_class_id=$1) as member_ids from projects p join profiles pr on pr.id=p.owner_id join class_members m on m.child_id=pr.id
    where m.class_id=$1 and pr.role='child' and not p.is_example and (p.group_class_id is null or p.group_class_id=$1) order by p.updated_at desc`,
    [classId],
  );
  const { rows: groups } = await db.query(
    "select id,name,category from classroom_groups where class_id=$1 order by created_at,id",
    [classId],
  );
  const { rows: students } = await db.query(
    `select pr.id,pr.display_name,pr.username,gm.group_id,
    (select count(*)::int from prompt_reviews r where r.child_id=pr.id and r.decision<>'allow') as alert_count,
    (select count(*)::int from prompt_reviews r where r.child_id=pr.id and r.hold_status='pending') as pending_count
    from class_members m join profiles pr on pr.id=m.child_id
    left join classroom_group_members gm on gm.class_id=m.class_id and gm.child_id=m.child_id
    where m.class_id=$1 and pr.role='child' order by lower(pr.display_name),pr.id`,
    [classId],
  );
  const { rows: classroomProjects } = await db.query(
    `select p.vm_id as id,p.metadata->>'name' as name,pr.display_name as owner,pr.role as owner_role,p.owner_id,p.classroom_group_id as group_id,g.name as group_name,p.metadata->'conversations'->0->>'id' as conversation_id
    from class_projects cp join projects p on p.vm_id=cp.vm_id join profiles pr on pr.id=p.owner_id
    left join classroom_groups g on g.id=p.classroom_group_id and g.class_id=cp.class_id
    where cp.class_id=$1 and not p.is_example and (exists(select 1 from class_members cm where cm.class_id=$1 and cm.child_id=p.owner_id) or exists(select 1 from classes c where c.id=$1 and (c.teacher_id=p.owner_id or exists(select 1 from class_teachers ct where ct.class_id=c.id and ct.teacher_id=p.owner_id))))
    order by cp.created_at desc,p.vm_id`,
    [classId],
  );
  return Response.json(
    { projects: rows, classroomProjects, groups, students },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ classId: string }> },
) {
  const user = platformEnabled() ? await getProfile() : null;
  if (user?.role === "child" && checkOrigin(req)) {
    const { classId } = await params;
    const body = await req.json().catch(() => ({}));
    if (
      !/^[a-f0-9-]{36}$/i.test(classId) ||
      !/^vm-[a-z0-9]+$/.test(body.projectId) ||
      !/^[a-f0-9-]{36}$/i.test(body.groupId)
    )
      return Response.json(
        { error: "Invalid group project." },
        { status: 400 },
      );
    try {
      const { shareGroupProject } = await import("@/lib/classroom-groups");
      await shareGroupProject(
        database(),
        classId,
        user.id,
        body.projectId,
        body.groupId,
      );
      return Response.json({ ok: true });
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : "Could not share project." },
        { status: 400 },
      );
    }
  }
  if (user?.role !== "teacher" || !checkOrigin(req))
    return Response.json(
      { error: "Teacher access required." },
      { status: 403 },
    );
  const { classId } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(classId))
    return Response.json({ error: "Invalid classroom." }, { status: 400 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body))
    return Response.json({ error: "Invalid group action." }, { status: 400 });
  try {
    await changeClassroomGroups(database(), classId, user.id, body);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ClassroomGroupError)
      return Response.json({ error: error.message }, { status: error.status });
    if (["42P01", "42703"].includes((error as { code?: string }).code || ""))
      return Response.json(
        {
          error:
            "Classroom groups need the latest database migration. Ask your administrator to finish setup.",
        },
        { status: 503 },
      );
    throw error;
  }
}

export async function GET(
  req: Request,
  context: { params: Promise<{ classId: string }> },
) {
  try {
    return await readGroups(req, context);
  } catch (error) {
    if (["42P01", "42703"].includes((error as { code?: string }).code || ""))
      return Response.json(
        {
          error:
            "Classroom groups need the latest database migration. Ask your administrator to finish setup.",
        },
        { status: 503 },
      );
    throw error;
  }
}
