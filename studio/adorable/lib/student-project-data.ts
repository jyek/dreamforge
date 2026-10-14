import { database } from "./database";
import { guidanceSQL } from "./prompt-guidance";
export async function studentProjectData(
  teacherId: string,
  filter: { classId?: string; studentId?: string },
) {
  const db = database();
  if (filter.classId) {
    const { rowCount } = await db.query(
      "select 1 from adorable.classes where id=$1 and teacher_id=$2",
      [filter.classId, teacherId],
    );
    if (!rowCount) return null;
  }
  if (filter.studentId) {
    const { rowCount } = await db.query(
      "select 1 from adorable.teacher_builders where teacher_id=$1 and child_id=$2",
      [teacherId, filter.studentId],
    );
    if (!rowCount) return null;
  }
  const { rows: students } = await db.query(
    `select pr.id,pr.display_name,pr.username,
 (select count(*)::int from adorable.projects p where p.owner_id=pr.id and not p.is_example) as project_count,
 (select count(*)::int from adorable.prompt_reviews r where r.child_id=pr.id) as prompt_count,
 (select count(*)::int from adorable.prompt_reviews r where r.child_id=pr.id and cardinality(${guidanceSQL})>0) as guidance_count,'{}'::jsonb as categories
 from adorable.profiles pr where exists(select 1 from adorable.teacher_builders b where b.child_id=pr.id and b.teacher_id=$1) and ($2::uuid is null or exists(select 1 from adorable.class_members m where m.class_id=$2 and m.child_id=pr.id)) and ($3::uuid is null or pr.id=$3) order by lower(pr.display_name),pr.id`,
    [teacherId, filter.classId || null, filter.studentId || null],
  );
  const { rows: projects } = await db.query(
    `select p.vm_id,p.owner_id,p.metadata->>'name' as name,p.metadata->'conversations'->0->>'id' as conversation_id,
 (select count(*)::int from adorable.prompt_reviews r where r.vm_id=p.vm_id and r.child_id=p.owner_id) as prompt_count,
 (select count(*)::int from adorable.prompt_reviews r where r.vm_id=p.vm_id and r.child_id=p.owner_id and cardinality(${guidanceSQL})>0) as guidance_count
 from adorable.projects p where not p.is_example and p.owner_id=any($1::uuid[]) order by p.updated_at desc`,
    [students.map((s) => s.id)],
  );
  return { students, projects };
}
