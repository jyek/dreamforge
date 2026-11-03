import type { SafetyError } from "./kids-safety";
import { projectGroupMemberSQL } from "./project-group";
import { classroomTeacherSQL } from "./classroom-permissions";
type Db = {
  query: (
    sql: string,
    params: unknown[],
  ) => Promise<{ rows: any[]; rowCount: number | null }>;
};
/** Holding is an extra layer. If its columns are not available (the migration
 * has not been applied yet) or the update fails, chat must carry on with the
 * normal moderation instead of failing. Logs only a fixed error code. */
async function failSafe<T>(fallback: T, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const code = (error as { code?: unknown })?.code;
    console.error("prompt_hold.unavailable", {
      code:
        typeof code === "string" && /^[A-Z0-9]{5}$/.test(code)
          ? code
          : undefined,
    });
    return fallback;
  }
}
export { HELD_PROMPT_MESSAGE } from "./prompt-approval-messages";
/** Record a classified rejection without creating an approval request. The
 * student must explicitly ask before a teacher can approve it. */
export async function recordModerationOutcome(
  db: Db,
  reviewId: string,
  childId: string,
  error: Pick<SafetyError, "outcome">,
) {
  const outcome = error.outcome;
  if (!outcome || outcome.decision === "allow") return false;
  return failSafe(false, async () => {
    const { rows } = await db.query(
      `update prompt_reviews r set decision=$3,categories=$4,severity=$5
       where r.id=$1 and r.child_id=$2 and r.reviewed_at is null returning r.id`,
      [
        reviewId,
        childId,
        outcome.decision,
        outcome.categories,
        outcome.severity,
      ],
    );
    return !!rows[0];
  });
}
/** If the teacher approved exactly this prompt, use that approval once. */
export async function consumeApprovedHold(
  db: Db,
  input: {
    childId: string;
    projectId: string;
    conversationId: string;
    content: string;
  },
) {
  return failSafe(false, async () => {
    const { rowCount } = await db.query(
      `update prompt_reviews set held_prompt_used_at=now()
     where id=(select id from prompt_reviews where child_id=$1 and conversation_id=$2
       and content=$3 and vm_id=$4 and decision in ('review','block') and hold_status='approved' and held_prompt_used_at is null
       and exists(select 1 from class_members current_class where current_class.child_id=prompt_reviews.child_id and ${classroomTeacherSQL("current_class.class_id", "prompt_reviews.reviewed_by")})
       order by created_at desc limit 1)
     and held_prompt_used_at is null`,
      [input.childId, input.conversationId, input.content, input.projectId],
    );
    return !!rowCount;
  });
}
/** Current classrooms in which this actor may decide a student's held prompt. */
export const approvalClassroomsSQL = (
  childId: string,
  actorId = "$1",
  classId = "null",
) =>
  `coalesce((select json_agg(json_build_object('id',c.id,'name',c.name) order by lower(c.name))
    from classes c join class_members m on m.class_id=c.id
    where m.child_id=${childId} and ${classroomTeacherSQL("c.id", actorId)}
    and (${classId}::uuid is null or c.id=${classId}::uuid)),'[]'::json)`;

/** Only a current classroom teacher can decide an explicitly requested prompt.
 * A classification stays recorded even when the teacher grants an exception. */
export async function decideHold(
  db: Db,
  input: {
    id: string;
    teacherId: string;
    classId: string;
    action: "approve" | "deny";
  },
) {
  const { rowCount } = await db.query(
    `update prompt_reviews r set hold_status=$3,reviewed_by=$1,reviewed_at=now()
     where r.id=$2 and r.hold_status='pending' and r.decision in ('review','block') and exists(select 1 from class_members m where m.child_id=r.child_id and m.class_id=$4::uuid and ${classroomTeacherSQL("m.class_id")})`,
    [
      input.teacherId,
      input.id,
      input.action === "approve" ? "approved" : "denied",
      input.classId,
    ],
  );
  return !!rowCount;
}

/** The author must still have a classroom teacher and access to this project. */
const requestAccessSQL = (
  review = "r",
) => `exists(select 1 from class_members m join classes c on c.id=m.class_id join profiles t on t.id=c.teacher_id where m.child_id=${review}.child_id and t.role='teacher')
 and exists(select 1 from projects p where p.vm_id=${review}.vm_id and not p.is_example and (p.owner_id=${review}.child_id or ${projectGroupMemberSQL("p", `${review}.child_id`)}))`;
export async function studentPromptApprovals(
  db: Db,
  input: { childId: string; projectId: string; conversationId: string },
) {
  return (
    await db.query(
      `select r.id,r.content,r.hold_status as status,r.reviewed_at,r.held_prompt_used_at is not null as used,
   (${requestAccessSQL()}) as eligible,
   exists(select 1 from class_members current_class where current_class.child_id=r.child_id and ${classroomTeacherSQL("current_class.class_id", "r.reviewed_by")}) as can_resume,
   (r.hold_status is null and r.held_prompt_used_at is null and ${requestAccessSQL()}) as can_request
   from prompt_reviews r where r.child_id=$1 and r.vm_id=$2 and r.conversation_id=$3 and r.decision in ('review','block')
   order by r.created_at,r.id`,
      [input.childId, input.projectId, input.conversationId],
    )
  ).rows;
}
/** Atomic, idempotent request: never creates a second queue item or resets a decision. */
export async function requestPromptApproval(
  db: Db,
  input: {
    id: string;
    childId: string;
    projectId: string;
    conversationId: string;
  },
) {
  const { rows } = await db.query(
    `update prompt_reviews r set hold_status='pending',reviewed_by=null,reviewed_at=null
   where r.id=$1 and r.child_id=$2 and r.vm_id=$3 and r.conversation_id=$4
    and r.decision in ('review','block') and r.hold_status is null and r.held_prompt_used_at is null
    and exists(select 1 from profiles author where author.id=$2 and author.role='child') and ${requestAccessSQL()}
   returning r.id,r.hold_status as status`,
    [input.id, input.childId, input.projectId, input.conversationId],
  );
  return rows[0] || null;
}
