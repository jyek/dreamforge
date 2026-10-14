import { database } from "@/lib/database";
import { getProfile, platformEnabled } from "@/lib/platform-auth";
import { guidanceSQL } from "@/lib/prompt-guidance";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ classId: string }> },
) {
  const user = platformEnabled() ? await getProfile() : null;
  if (user?.role !== "teacher")
    return Response.json(
      { error: "Teacher access required." },
      { status: 403 },
    );
  const { classId } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(classId))
    return Response.json({ error: "Invalid classroom." }, { status: 400 });
  const db = database();
  const { rows: classes } = await db.query(
    "select id,name from adorable.classes where id=$1 and teacher_id=$2",
    [classId, user.id],
  );
  if (!classes.length)
    return Response.json({ error: "Classroom not found." }, { status: 404 });
  const { rows: students } = await db.query(
    `select pr.id,pr.display_name,pr.username,
 (select count(*)::int from adorable.projects p where p.owner_id=pr.id and not p.is_example) as project_count,
 (select count(*)::int from adorable.prompt_reviews r where r.child_id=pr.id) as prompt_count,
 (select count(*)::int from adorable.prompt_reviews r where r.child_id=pr.id and cardinality(${guidanceSQL})>0) as guidance_count
 from adorable.class_members m join adorable.profiles pr on pr.id=m.child_id where m.class_id=$1 order by lower(pr.display_name),pr.id`,
    [classId],
  );
  const { rows: projects } = await db.query(
    `select p.vm_id,p.owner_id,p.metadata->>'name' as name,p.metadata->'conversations'->0->>'id' as conversation_id,
 (select count(*)::int from adorable.prompt_reviews r where r.vm_id=p.vm_id and r.child_id=p.owner_id) as prompt_count
 from adorable.projects p where not p.is_example and exists(select 1 from adorable.class_members m where m.class_id=$1 and m.child_id=p.owner_id) order by p.updated_at desc`,
    [classId],
  );
  return Response.json({
    classroom: classes[0],
    students: students.map((s) => ({ ...s, categories: {} })),
    projects,
  });
}
