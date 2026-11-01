import type { Pool } from "pg";
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
            `select c.id,c.teacher_id,c.invite_code,o.school_id from classes c join profiles o on o.id=c.teacher_id where c.id=$1 and ${groupManagerSQL("c.id", "$2")} for update of c`,
            [input.classId, actorId],
          )
        ).rows[0]
      : (
          await tx.query(
            "select school_id from profiles where id=$1 and role='teacher' and school_id is not null",
            [actorId],
          )
        ).rows[0];
    if (!c || (!input.classId && input.role !== "student"))
      throw Error(
        "Choose a classroom you manage or invite a student to your school.",
      );
    const role = input.role === "teacher" ? "teacher" : "child";
    const person = (
      await tx.query(
        `select id,display_name,username from profiles where role=$1 and (school_id is not distinct from $2 or (role='child' and school_id is null)) and (lower(username)=lower($3) or lower(auth_email)=lower($3)) for update`,
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
    if (input.action === "remove" && role === "child")
      await tx.query(
        "delete from class_members where class_id=$1 and child_id=$2",
        [c.id, person.id],
      );
    if (input.action === "add") {
      if (role === "child") {
        const conflict = await tx.query(
          "select 1 from class_members m join classes c on c.id=m.class_id join profiles owner on owner.id=c.teacher_id where m.child_id=$1 and owner.school_id is distinct from $2 limit 1",
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
      else if (role === "teacher" && person.id !== c.teacher_id)
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
