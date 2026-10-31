type Db = {
  query: (
    sql: string,
    params: unknown[],
  ) => Promise<{ rows: any[]; rowCount: number | null }>;
};
/** The school an account belongs to, or null for an independent account. */
export async function schoolOf(db: Db, profileId: string) {
  const { rows } = await db.query(
    "select school_id from profiles where id=$1",
    [profileId],
  );
  return (rows[0]?.school_id as string | null | undefined) ?? null;
}
/** The school this account administers, or null. */
export async function administeredSchool(db: Db, profileId: string) {
  const { rows } = await db.query(
    "select school_id from school_admins where profile_id=$1 limit 1",
    [profileId],
  );
  return (rows[0]?.school_id as string | undefined) ?? null;
}
/** Accounts may only be linked when both are in the same school, or both are
 * independent. This is the rule for joining a class and for co-teaching. */
export const sameSchool = (a: string | null, b: string | null) =>
  (a ?? null) === (b ?? null);
export const SCHOOL_MISMATCH_MESSAGE =
  "This class belongs to a different school. Ask your school administrator for help.";
