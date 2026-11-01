import { inviteToken, tokenHash } from "./platform-auth";
import type { Pool, PoolClient } from "pg";
import { groupManagerSQL } from "./project-group";
export async function createStudentSchoolInvite(
  db: Pool,
  actorId: string,
  classId?: string,
) {
  const token = inviteToken();
  const result = await db.query(
    classId
      ? `insert into student_invites(token_hash,school_id,created_by) select $1,c.school_id,$2 from classes c where c.id=$3 and c.school_id is not null and ${groupManagerSQL("c.id", "$2")} returning school_id`
      : "insert into student_invites(token_hash,school_id,created_by) select $1,school_id,id from profiles where id=$2 and role='teacher' and school_id is not null returning school_id",
    classId
      ? [tokenHash(token), actorId, classId]
      : [tokenHash(token), actorId],
  );
  if (!result.rowCount) throw Error("Join a school before inviting students.");
  return token;
}
export async function lockStudentSchoolInvite(
  db: Pick<PoolClient, "query">,
  token: string,
) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  return (
    (
      await db.query(
        "select token_hash,school_id from student_invites where token_hash=$1 and used_at is null and expires_at>now() for update",
        [tokenHash(token)],
      )
    ).rows[0] || null
  );
}
