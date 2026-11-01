import type { Pool } from "pg";
const permitted = (alias: string, role: "teacher" | "student") =>
  `(${alias}.created_by=$1 or exists(select 1 from school_admins a where a.profile_id=$1 and a.school_id=${alias}.school_id) ${role === "teacher" ? `or exists(select 1 from classes manage_class join profiles owner on owner.id=manage_class.teacher_id where manage_class.id=${alias}.classroom_id and (manage_class.teacher_id=$1 or exists(select 1 from school_admins a where a.profile_id=$1 and a.school_id=owner.school_id)))` : ""})`;
export async function listInvitations(
  db: Pool,
  actorId: string,
  role: "teacher" | "student",
) {
  const table = role === "teacher" ? "teacher_invites" : "student_invites";
  return (
    await db.query(
      `select i.token_hash as id,i.expires_at,${role === "teacher" ? "i.make_admin" : "false"} as make_admin,${role === "teacher" ? "c.name" : "null::text"} as classroom_name from ${table} i ${role === "teacher" ? "left join classes c on c.id=i.classroom_id" : ""} where ${permitted("i", role)} and i.used_at is null and i.expires_at>now() order by i.expires_at desc limit 50`,
      [actorId],
    )
  ).rows;
}
export async function revokeInvitation(
  db: Pool,
  actorId: string,
  role: "teacher" | "student",
  id: string,
) {
  const table = role === "teacher" ? "teacher_invites" : "student_invites";
  return !!(
    await db.query(
      `update ${table} i set expires_at=now() where token_hash=$2 and ${permitted("i", role)} and i.used_at is null and i.expires_at>now() returning token_hash`,
      [actorId, id],
    )
  ).rowCount;
}
