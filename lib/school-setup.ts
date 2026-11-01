import { randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { addDirectoryPerson } from "./people-directory";
/** Every mutation checks the actor and both endpoints of the relationship in SQL. */
export async function setupSchool(
  db: Pool,
  actorId: string,
  schoolId: string,
  input: Record<string, unknown>,
) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const uuid = (v: unknown): v is string =>
    typeof v === "string" &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
  const authorized = `exists(select 1 from school_admins a where a.school_id=$1 and a.profile_id=$2)`;
  if (
    input.action === "createClass" &&
    uuid(input.teacherId) &&
    name.length > 0 &&
    name.length <= 80
  ) {
    const result = await db.query(
      `insert into classes(teacher_id,name,invite_code)
      select p.id,$4,$5 from profiles p where p.id=$3 and p.school_id=$1 and p.role='teacher' and ${authorized} returning id`,
      [
        schoolId,
        actorId,
        input.teacherId,
        name,
        randomBytes(9).toString("hex").toUpperCase(),
      ],
    );
    return !!result.rowCount;
  }
  if (
    ["enrollStudent", "addTeacher"].includes(String(input.action)) &&
    uuid(input.classId) &&
    uuid(input.personId)
  ) {
    const student = input.action === "enrollStudent";
    const result = await db.query(
      `insert into ${student ? "class_members(class_id,child_id)" : "class_teachers(class_id,teacher_id,added_by)"}
      select c.id,p.id${student ? "" : ",$2::uuid"} from classes c join profiles owner on owner.id=c.teacher_id
      join profiles p on p.id=$4 where c.id=$3 and owner.school_id=$1 and p.school_id=$1
      and p.role='${student ? "child" : "teacher"}' and ${authorized} on conflict do nothing returning class_id`,
      [schoolId, actorId, input.classId, input.personId],
    );
    return !!result.rowCount;
  }
  if (
    input.action === "removeStudent" &&
    uuid(input.classId) &&
    uuid(input.personId)
  ) {
    const { rows } = await db.query(
      `select p.username from class_members m join classes c on c.id=m.class_id join profiles owner on owner.id=c.teacher_id join profiles p on p.id=m.child_id
      where c.id=$3 and p.id=$4 and owner.school_id=$1 and p.school_id=$1 and p.role='child' and ${authorized}`,
      [schoolId, actorId, input.classId, input.personId],
    );
    if (!rows[0]) return false;
    await addDirectoryPerson(db, actorId, {
      action: "remove",
      role: "student",
      classId: input.classId,
      identifier: rows[0].username,
    });
    return true;
  }

  return false;
}
