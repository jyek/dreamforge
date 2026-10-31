import type { SafetyError } from "./kids-safety";
import { teacherStudentAccessSQL } from "./classroom-permissions";
type Db = {
  query: (
    sql: string,
    params: unknown[],
  ) => Promise<{ rows: any[]; rowCount: number | null }>;
};
export const HELD_PROMPT_MESSAGE =
  "Your teacher needs to check this request first. It will continue on its own once they approve it.";
/** Records the real moderation outcome on the teacher's record. A "review"
 * outcome is also held for the teacher, but only when the student has a teacher
 * who can act on it. Blocked prompts are never held, so they can't be approved.
 * Returns true when the prompt is waiting for approval. */
export async function recordModerationOutcome(
  db: Db,
  reviewId: string,
  childId: string,
  error: Pick<SafetyError, "outcome">,
) {
  const outcome = error.outcome;
  if (!outcome || outcome.decision === "allow") return false;
  const hold = outcome.decision === "review";
  const { rows } = await db.query(
    `update prompt_reviews r set decision=$3,categories=$4,severity=$5,
       hold_status=case when $6::boolean and exists(select 1 from teacher_builders t where t.child_id=r.child_id) then 'pending' else r.hold_status end
     where r.id=$1 and r.child_id=$2 and r.reviewed_at is null
     returning (r.hold_status='pending') as held`,
    [
      reviewId,
      childId,
      outcome.decision,
      outcome.categories,
      outcome.severity,
      hold,
    ],
  );
  return rows[0]?.held === true;
}
/** If the teacher approved exactly this prompt, use that approval once. */
export async function consumeApprovedHold(
  db: Db,
  input: { childId: string; conversationId: string; content: string },
) {
  const { rowCount } = await db.query(
    `update prompt_reviews set held_prompt_used_at=now()
     where id=(select id from prompt_reviews where child_id=$1 and conversation_id=$2
       and content=$3 and hold_status='approved' and held_prompt_used_at is null
       order by created_at desc limit 1)
     and held_prompt_used_at is null`,
    [input.childId, input.conversationId, input.content],
  );
  return !!rowCount;
}
/** A teacher approves or declines a held prompt. Only a prompt held for review
 * can be approved (blocked prompts never are), and only by a teacher of that
 * student. Returns false when nothing was changed. */
export async function decideHold(
  db: Db,
  input: { id: string; teacherId: string; action: "approve" | "deny" },
) {
  const { rowCount } = await db.query(
    `update prompt_reviews r set hold_status=$3,reviewed_by=$1,reviewed_at=now()
     where r.id=$2 and r.hold_status='pending' and r.decision='review' and ${teacherStudentAccessSQL("r.child_id")}`,
    [
      input.teacherId,
      input.id,
      input.action === "approve" ? "approved" : "denied",
    ],
  );
  return !!rowCount;
}
