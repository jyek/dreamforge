import type { Pool } from "pg";
import { syncClassroomGroupProjects } from "./classroom-groups";
import { groupManagerSQL } from "./project-group";
export async function directoryData(db: Pool, actorId: string) {
  const classes = (
    await db.query(
      `select c.id,c.name,c.invite_code from classes c where ${groupManagerSQL("c.id", "$1")} order by lower(c.name)`,
      [actorId],
    )
  ).rows;
  const ids = classes.map((c) => c.id);
  const teachers = (
    await db.query(
      `select p.id,p.display_name,p.username,exists(select 1 from school_admins where profile_id=p.id) as is_admin,0 as classes,
 coalesce((select json_agg(json_build_object('id',c.id,'name',c.name)) from classes c where c.id=any($1::uuid[]) and (c.teacher_id=p.id or exists(select 1 from class_teachers t where t.class_id=c.id and t.teacher_id=p.id))),'[]') as classrooms
 from profiles p where p.role='teacher' and exists(select 1 from classes c where c.id=any($1::uuid[]) and (c.teacher_id=p.id or exists(select 1 from class_teachers t where t.class_id=c.id and t.teacher_id=p.id))) order by lower(p.display_name)`,
      [ids],
    )
  ).rows;
  const students = (
    await db.query(
      `select p.id,p.display_name,p.username,(select count(*)::int from projects where owner_id=p.id and not is_example) as project_count,
 (select json_agg(json_build_object('id',c.id,'name',c.name)) from class_members m join classes c on c.id=m.class_id where m.child_id=p.id and c.id=any($1::uuid[])) as classrooms from profiles p where p.role='child' and exists(select 1 from class_members m where m.child_id=p.id and m.class_id=any($1::uuid[])) order by lower(p.display_name)`,
      [ids],
    )
  ).rows;
  return { classes, teachers, students };
}
export async function addDirectoryPerson(
  db: Pool,
  actorId: string,
  input: Record<string, unknown>,
) {
  const tx = await db.connect();
  try {
    await tx.query("begin");
    const c = input.classId
      ? (
          await tx.query(
            `select c.id,c.teacher_id,c.invite_code,c.school_id from classes c join profiles o on o.id=c.teacher_id where c.id=$1 and ${groupManagerSQL("c.id", "$2")} for update of c`,
            [input.classId, actorId],
          )
        ).rows[0]
      : (
          await tx.query(
            "select school_id from profiles where id=$1 and role='teacher' and school_id is not null",
            [actorId],
          )
        ).rows[0];
    if (!c)
      throw Error(
        "Choose a classroom you manage or add a person to your school.",
      );
    const role = input.role === "teacher" ? "teacher" : "child";
    const person = (
      await tx.query(
        `select id,display_name,username from profiles where role=$1 and ($1='teacher' or school_id is not distinct from $2 or school_id is null) and (lower(username)=lower($3) or lower(auth_email)=lower($3)) for update`,
        [
          role,
          c.school_id,
          String(input.identifier || "")
            .trim()
            .replace(/^@/, ""),
        ],
      )
    ).rows[0];
    if (!person)
      throw Error(
        "No matching account in your school. Check the username or email, or share an invitation link.",
      );
    if (input.action === "remove" && role === "child") {
      if (!c.id) throw Error("Choose a classroom to remove this student from.");
      await tx.query(
        "delete from class_members where class_id=$1 and child_id=$2",
        [c.id, person.id],
      );
      await syncClassroomGroupProjects(tx, c.id);
    }
    if (input.action === "add") {
      if (role === "teacher") {
        if (c.school_id)
          await tx.query(
            "insert into school_teachers(school_id,teacher_id,added_by) values($1,$2,$3) on conflict do nothing",
            [c.school_id, person.id, actorId],
          );
        await tx.query(
          "update profiles set school_id=$2 where id=$1 and school_id is null",
          [person.id, c.school_id],
        );
      }
      if (role === "child") {
        const conflict = await tx.query(
          "select 1 from class_members m join classes c on c.id=m.class_id join profiles owner on owner.id=c.teacher_id where m.child_id=$1 and c.school_id is distinct from $2 limit 1",
          [person.id, c.school_id],
        );
        if (conflict.rowCount)
          throw Error("This student belongs to another school.");
        await tx.query(
          "update profiles set school_id=$2 where id=$1 and school_id is null",
          [person.id, c.school_id],
        );
      }
      if (role === "child" && c.id)
        await tx.query(
          "insert into class_members(class_id,child_id) values($1,$2) on conflict do nothing",
          [c.id, person.id],
        );
      else if (role === "teacher" && c.id && person.id !== c.teacher_id)
        await tx.query(
          "insert into class_teachers(class_id,teacher_id,added_by) values($1,$2,$3) on conflict do nothing",
          [c.id, person.id, actorId],
        );
    }
    await tx.query("commit");
    return person;
  } catch (e) {
    await tx.query("rollback");
    throw e;
  } finally {
    tx.release();
  }
}

export async function searchDirectoryPeople(
  db: Pool,
  actorId: string,
  input: Record<string, unknown>,
) {
  const query = String(input.identifier || "")
    .trim()
    .replace(/^@/, "");
  if (query.length < 2 || query.length > 254) return [];
  const scope = input.classId
    ? (
        await db.query(
          `select c.school_id from classes c where c.id=$1 and ${groupManagerSQL("c.id", "$2")}`,
          [input.classId, actorId],
        )
      ).rows[0]
    : (
        await db.query(
          "select school_id from profiles where id=$1 and role='teacher'",
          [actorId],
        )
      ).rows[0];
  if (!scope) throw Error("Choose a classroom you manage.");
  const role = input.role === "teacher" ? "teacher" : "child";
  if (role === "teacher") {
    return (
      await db.query(
        `select p.id,p.display_name,p.username from profiles p where p.role='teacher'
       and (strpos(lower(p.username),lower($1))>0 or strpos(lower(p.display_name),lower($1))>0 or lower(p.auth_email)=lower($1))
       order by (lower(p.username)=lower($1)) desc,lower(p.display_name),p.id limit 8`,
        [query],
      )
    ).rows;
  }
  const results = (
    await db.query(
      `select p.id,p.display_name,p.username from profiles p where p.role=$1 and (
  (p.school_id is not distinct from $2 and ($2::uuid is not null or exists(select 1 from classes c where ${groupManagerSQL("c.id", "$4")} and (c.teacher_id=p.id or exists(select 1 from class_teachers ct where ct.class_id=c.id and ct.teacher_id=p.id) or exists(select 1 from class_members cm where cm.class_id=c.id and cm.child_id=p.id)))) and (strpos(lower(p.username),lower($3))>0 or strpos(lower(p.display_name),lower($3))>0 or lower(p.auth_email)=lower($3)))
  or (p.school_id is null and (lower(p.username)=lower($3) or lower(p.auth_email)=lower($3)))
 ) order by (lower(p.username)=lower($3)) desc,lower(p.display_name),p.id limit 8`,
      [role, scope.school_id, query, actorId],
    )
  ).rows;
  return results;
}
