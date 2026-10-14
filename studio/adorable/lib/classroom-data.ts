import { database } from "./database";
import type { Profile } from "./platform-auth";
import { guidanceSQL } from "./prompt-guidance";
type Queryable = Pick<ReturnType<typeof database>, "query">;
export async function classroomAccess(
  classId: string,
  user: Profile,
  db: Queryable = database(),
) {
  const { rows } = await db.query(
    `select c.id,c.name,c.teacher_id,pr.display_name as teacher_name from adorable.classes c join adorable.profiles pr on pr.id=c.teacher_id where c.id=$1 and (c.teacher_id=$2 or exists(select 1 from adorable.class_members m where m.class_id=c.id and m.child_id=$2))`,
    [classId, user.id],
  );
  return rows[0] || null;
}
export async function classroomData(
  classId: string,
  user: Profile,
  db: Queryable = database(),
) {
  const classroom = await classroomAccess(classId, user, db);
  if (!classroom) return null;
  const teacher = user.role === "teacher" && classroom.teacher_id === user.id;
  const { rows: students } = await db.query(
    `select pr.id,pr.display_name,pr.username,
 (select count(*)::int from adorable.class_projects cp join adorable.projects p on p.vm_id=cp.vm_id where cp.class_id=$1 and p.owner_id=pr.id) as project_count,
 ${teacher ? `(select count(*)::int from adorable.prompt_reviews r join adorable.class_projects cp on cp.vm_id=r.vm_id and cp.class_id=$1 where r.child_id=pr.id)` : "0"} as prompt_count,
 ${teacher ? `(select count(*)::int from adorable.prompt_reviews r join adorable.class_projects cp on cp.vm_id=r.vm_id and cp.class_id=$1 where r.child_id=pr.id and cardinality(${guidanceSQL})>0)` : "0"} as guidance_count
 from adorable.class_members m join adorable.profiles pr on pr.id=m.child_id where m.class_id=$1 order by lower(pr.display_name),pr.id`,
    [classId],
  );
  const { rows: projects } = await db.query(
    `select p.vm_id,p.owner_id,pr.display_name as owner_name,p.metadata->>'name' as name,case when $2::boolean or p.owner_id=$3 then p.metadata->'conversations'->0->>'id' else null end as conversation_id,
 ${teacher ? "(select count(*)::int from adorable.prompt_reviews r where r.vm_id=p.vm_id and r.child_id=p.owner_id)" : "0"} as prompt_count,
 ${teacher ? `(select count(*)::int from adorable.prompt_reviews r where r.vm_id=p.vm_id and r.child_id=p.owner_id and cardinality(${guidanceSQL})>0)` : "0"} as guidance_count
 from adorable.class_projects cp join adorable.projects p on p.vm_id=cp.vm_id join adorable.profiles pr on pr.id=p.owner_id where cp.class_id=$1 and (p.owner_id=$4 or exists(select 1 from adorable.class_members m where m.class_id=$1 and m.child_id=p.owner_id)) order by cp.created_at desc`,
    [classId, teacher, user.id, classroom.teacher_id],
  );
  const { rows: availableProjects } = await db.query(
    `select p.vm_id,p.metadata->>'name' as name,exists(select 1 from adorable.class_projects cp where cp.class_id=$1 and cp.vm_id=p.vm_id) as assigned from adorable.projects p where p.owner_id=$2 and not p.is_example order by p.updated_at desc`,
    [classId, user.id],
  );
  return {
    classroom,
    students: students.map((s) => ({ ...s, categories: {} })),
    projects,
    availableProjects,
  };
}
export async function assignClassroomProject(
  classId: string,
  projectId: string,
  user: Profile,
  remove = false,
  db: Queryable = database(),
) {
  const sql = remove
    ? `delete from adorable.class_projects cp using adorable.projects p where cp.class_id=$1 and cp.vm_id=$2 and p.vm_id=cp.vm_id and p.owner_id=$3 and exists(select 1 from adorable.classes c where c.id=$1 and (c.teacher_id=$3 or exists(select 1 from adorable.class_members m where m.class_id=c.id and m.child_id=$3))) returning cp.vm_id`
    : `insert into adorable.class_projects(class_id,vm_id,assigned_by) select c.id,p.vm_id,$3 from adorable.classes c cross join adorable.projects p where c.id=$1 and p.vm_id=$2 and p.owner_id=$3 and not p.is_example and (c.teacher_id=$3 or exists(select 1 from adorable.class_members m where m.class_id=c.id and m.child_id=$3)) on conflict(class_id,vm_id) do update set assigned_by=excluded.assigned_by returning vm_id`;
  const { rowCount } = await db.query(sql, [classId, projectId, user.id]);
  return !!rowCount;
}
