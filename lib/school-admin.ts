import { createHash, randomBytes } from "node:crypto";
type Db = {
  query: (
    sql: string,
    params: unknown[],
  ) => Promise<{ rows: any[]; rowCount: number | null }>;
};
const newToken = () => randomBytes(24).toString("base64url");
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
/** Invitation link that creates a teacher account inside a school. */
export async function createSchoolTeacherInvite(
  db: Db,
  input: { schoolId: string; createdBy: string; makeAdmin: boolean },
) {
  const token = newToken();
  await db.query(
    "insert into teacher_invites(token_hash,created_by,school_id,make_admin) values($1,$2,$3,$4)",
    [hash(token), input.createdBy, input.schoolId, input.makeAdmin],
  );
  return token;
}
/** Platform admin: add a school and the invitation for its first administrator. */
export async function createSchool(
  db: Db,
  input: { name: string; createdBy: string },
) {
  const { rows } = await db.query(
    "insert into schools(name) values($1) returning id,name",
    [input.name],
  );
  const token = await createSchoolTeacherInvite(db, {
    schoolId: rows[0].id,
    createdBy: input.createdBy,
    makeAdmin: true,
  });
  return { school: rows[0] as { id: string; name: string }, token };
}
export async function listSchools(db: Db) {
  const { rows } = await db.query(
    `select s.id,s.name,s.created_at,
       (select count(*)::int from school_admins a where a.school_id=s.id) as admins,
       (select count(*)::int from school_teachers t where t.school_id=s.id) as teachers,
       (select count(*)::int from profiles p where p.school_id=s.id and p.role='child') as students
     from schools s order by lower(s.name)`,
    [],
  );
  return rows;
}
/** Everything a school administrator sees about their own school, and only theirs. */
export async function schoolOverview(db: Db, schoolId: string) {
  const school = (
    await db.query("select id,name from schools where id=$1", [schoolId])
  ).rows[0];
  if (!school) return null;
  const teachers = (
    await db.query(
      `select p.id,p.display_name,p.username,
         exists(select 1 from school_admins a where a.school_id=$1 and a.profile_id=p.id) as is_admin,
         (select count(*)::int from classes c join profiles owner on owner.id=c.teacher_id where c.school_id=$1 and (c.teacher_id=p.id or exists(select 1 from class_teachers ct where ct.class_id=c.id and ct.teacher_id=p.id))) as classes
       from profiles p where p.role='teacher' and exists(select 1 from school_teachers st where st.school_id=$1 and st.teacher_id=p.id) order by lower(p.display_name)`,
      [schoolId],
    )
  ).rows;
  const classes = (
    await db.query(
      `select c.id,c.name,c.invite_code,t.display_name as teacher_name,
         (select count(*)::int from class_members m where m.class_id=c.id) as students,
         (select count(*)::int from class_projects cp join projects p on p.vm_id=cp.vm_id where cp.class_id=c.id and not p.is_example) as projects
       from classes c join profiles t on t.id=c.teacher_id
       where c.school_id=$1 order by lower(c.name)`,
      [schoolId],
    )
  ).rows;
  const counts = (
    await db.query(
      `select
         (select count(*)::int from profiles where school_id=$1 and role='child') as students,
         (select count(*)::int from prompt_reviews r join profiles c on c.id=r.child_id
            where c.school_id=$1 and r.decision<>'allow' and r.created_at>now()-interval '30 days') as flagged_30d`,
      [schoolId],
    )
  ).rows[0];
  for (const classroom of classes) {
    classroom.teachers = (
      await db.query(
        `select p.id,p.display_name,p.username,(p.id=c.teacher_id) as is_owner
      from classes c join profiles p on (p.id=c.teacher_id or exists(select 1 from class_teachers ct where ct.class_id=c.id and ct.teacher_id=p.id))
      where c.id=$2 and c.school_id=$1 order by (p.id=c.teacher_id) desc,p.display_name`,
        [schoolId, classroom.id],
      )
    ).rows;
    classroom.roster = (
      await db.query(
        `select p.id,p.display_name,p.username from class_members m join profiles p on p.id=m.child_id where m.class_id=$2 and p.school_id=$1 order by p.display_name`,
        [schoolId, classroom.id],
      )
    ).rows;
  }
  const alerts = (
    await db.query(
      `select r.id,r.child_id,r.content,r.decision,r.categories,r.hold_status,r.created_at,r.reviewed_at,
    p.display_name as child_name, reviewer.display_name as reviewer_name, projects.metadata->>'name' as project_name,
    coalesce((select json_agg(json_build_object('id',c.id,'name',c.name)) from class_members m join classes c on c.id=m.class_id join profiles owner on owner.id=c.teacher_id where m.child_id=r.child_id and c.school_id=$1),'[]'::json) as classrooms
    from prompt_reviews r join profiles p on p.id=r.child_id left join profiles reviewer on reviewer.id=r.reviewed_by left join projects on projects.vm_id=r.vm_id
    where p.school_id=$1 and (r.decision<>'allow' or r.hold_status is not null)
    order by r.created_at desc,r.id desc`,
      [schoolId],
    )
  ).rows;
  const studentList = (
    await db.query(
      `select p.id,p.display_name,p.username,
        (select count(*)::int from projects project where not project.is_example and
          (project.owner_id=p.id or exists(select 1 from project_members pm
            join class_members cm on cm.child_id=pm.child_id and cm.class_id=project.group_class_id
            join profiles owner on owner.id=project.owner_id
            where pm.vm_id=project.vm_id and pm.child_id=p.id and exists(select 1 from classes scope where scope.id=project.group_class_id and scope.school_id=$1)))) as project_count,
        coalesce((select json_agg(json_build_object('id',c.id,'name',c.name) order by lower(c.name))
          from class_members m join classes c on c.id=m.class_id join profiles owner on owner.id=c.teacher_id
          where m.child_id=p.id and c.school_id=$1),'[]'::json) as classrooms
      from profiles p where p.school_id=$1 and p.role='child' order by lower(p.display_name),p.id`,
      [schoolId],
    )
  ).rows;
  return { school, teachers, classes, alerts, studentList, ...counts };
}
