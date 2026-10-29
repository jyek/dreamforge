import assert from "node:assert/strict";

/** Remove only test payment/link records before Supabase deletes this fresh auth user. */
export async function clearPaymentFixtureRecords(
  pool,
  { id, username, email },
) {
  assert(/^e2e_[a-f0-9]{12}$/.test(username));
  assert.equal(email, `${username}@tests.dreamforge.invalid`);
  const db = await pool.connect();
  try {
    await db.query("begin");
    const {
      rows: [profile],
    } = await db.query(
      "select username,auth_email,role from profiles where id=$1 for update",
      [id],
    );
    // Provisioning can fail before the profile is created.
    if (profile) {
      assert.equal(profile.username, username);
      assert.equal(profile.auth_email, email);
      assert.equal(profile.role, "child");
      const {
        rows: [references],
      } = await db.query(
        `select
        (select count(*) from projects where owner_id=$1) +
        (select count(*) from usage_runs where child_id=$1) +
        (select count(*) from prompt_reviews where child_id=$1) as remaining,
        (select count(*) from payments where child_id=$1 and stripe_session_id !~ '^cs_test_[a-zA-Z0-9]+$') as non_test_payments`,
        [id],
      );
      assert.equal(
        Number(references.remaining),
        0,
        "Project cleanup required before account cleanup",
      );
      assert.equal(
        Number(references.non_test_payments),
        0,
        "Refusing to remove non-test payment records",
      );
      await db.query("delete from topup_requests where child_id=$1", [id]);
      await db.query("delete from payments where child_id=$1", [id]);
    }
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    db.release();
  }
}
