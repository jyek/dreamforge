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
       (select count(*)::int from profiles p where p.school_id=s.id and p.role='teacher') as teachers,
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
         exists(select 1 from school_admins a where a.school_id=p.school_id and a.profile_id=p.id) as is_admin,
         (select count(*)::int from classes c where c.teacher_id=p.id) as classes
       from profiles p where p.school_id=$1 and p.role='teacher' order by lower(p.display_name)`,
      [schoolId],
    )
  ).rows;
  const classes = (
    await db.query(
      `select c.id,c.name,t.display_name as teacher_name,
         (select count(*)::int from class_members m where m.class_id=c.id) as students
       from classes c join profiles t on t.id=c.teacher_id
       where t.school_id=$1 order by lower(c.name)`,
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
  return { school, teachers, classes, ...counts };
}
