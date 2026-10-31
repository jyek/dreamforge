import type { SafetyError } from "./kids-safety";
/** The teacher's prompt record is first written from fast local rules, before
 * moderation runs. When moderation then classifies the prompt, store that real
 * outcome so teachers see it as blocked or for review, with its categories. */
export async function recordModerationOutcome(
  db: { query: (sql: string, params: unknown[]) => Promise<unknown> },
  reviewId: string,
  error: Pick<SafetyError, "outcome">,
) {
  if (!error.outcome || error.outcome.decision === "allow") return;
  const { decision, categories, severity } = error.outcome;
  await db.query(
    "update prompt_reviews set decision=$2,categories=$3,severity=$4 where id=$1 and reviewed_at is null",
    [reviewId, decision, categories, severity],
  );
}
