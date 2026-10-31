import { database } from "./database";
import { createHash } from "node:crypto";
import type { Profile } from "./platform-auth";
import { sameSchool } from "./schools";
export async function acceptClassroomTeacherInvite(
  token: string,
  user: Profile,
) {
  if (user.role !== "teacher" || !/^[A-Za-z0-9_-]{20,100}$/.test(token))
    return null;
  const db = await database().connect();
  try {
    await db.query("begin");
    const hash = createHash("sha256").update(token).digest("hex");
    const { rows } = await db.query(
      `select i.classroom_id,i.created_by,i.used_by,c.teacher_id,o.school_id as owner_school,(select school_id from profiles where id=$2) as teacher_school from teacher_invites i join classes c on c.id=i.classroom_id join profiles o on o.id=c.teacher_id where i.token_hash=$1 and i.expires_at>now() for update of i`,
      [hash, user.id],
    );
    const invite = rows[0];
    // Co-teachers must belong to the classroom owner's school (or both be independent).
    if (
      !invite ||
      invite.created_by !== invite.teacher_id ||
      !sameSchool(invite.owner_school, invite.teacher_school)
    ) {
      await db.query("rollback");
      return null;
    }
    if (invite.used_by) {
      const { rowCount } = await db.query(
        "select 1 from class_teachers where class_id=$1 and teacher_id=$2",
        [invite.classroom_id, user.id],
      );
      await db.query("rollback");
      return invite.used_by === user.id && rowCount
        ? invite.classroom_id
        : null;
    }
    if (invite.teacher_id !== user.id)
      await db.query(
        "insert into class_teachers(class_id,teacher_id,added_by) values($1,$2,$3) on conflict do nothing",
        [invite.classroom_id, user.id, invite.created_by],
      );
    await db.query(
      "update teacher_invites set used_by=$2,used_at=now() where token_hash=$1",
      [hash, user.id],
    );
    await db.query("commit");
    return invite.classroom_id;
  } catch (e) {
    await db.query("rollback");
    throw e;
  } finally {
    db.release();
  }
}
