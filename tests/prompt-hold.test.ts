// @suite database
import assert from "node:assert/strict";
import { test, after } from "node:test";
import pg from "pg";
import { APPLICATION_DATABASE_OPTIONS } from "../lib/database-options.mjs";
import { SafetyError } from "../lib/kids-safety";
import {
  consumeApprovedHold,
  decideHold,
  recordModerationOutcome,
} from "../lib/prompt-hold";
const pool = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  options: APPLICATION_DATABASE_OPTIONS,
});
(globalThis as unknown as { dreamforgePool: pg.Pool }).dreamforgePool = pool;
after(() => pool.end());
const ids = {
  teacher: "00000000-0000-4000-8000-0000000000a1",
  other: "00000000-0000-4000-8000-0000000000a2",
  child: "00000000-0000-4000-8000-0000000000a3",
  loner: "00000000-0000-4000-8000-0000000000a4",
  classId: "00000000-0000-4000-8000-0000000000b1",
  conversation: "00000000-0000-4000-8000-0000000000c1",
};
const outcome = (decision: "block" | "review") =>
  new SafetyError("x", "blocked", {
    decision,
    categories: ["violence"],
    severity: decision === "block" ? "high" : "medium",
  });
async function review(child: string, project: string, content: string) {
  const { rows } = await pool.query(
    "insert into prompt_reviews(vm_id,child_id,conversation_id,content,decision,categories,severity) values($1,$2,$3,$4,'allow','{}','low') returning id",
    [project, child, ids.conversation, content],
  );
  return rows[0].id as string;
}
test("questionable prompts are held, approved once, and blocked ones never can be", async () => {
  for (const [id, name, role] of [
    [ids.teacher, "hold_teacher", "teacher"],
    [ids.other, "hold_other", "teacher"],
    [ids.child, "hold_child", "child"],
    [ids.loner, "hold_loner", "child"],
  ])
    await pool.query("insert into auth.users(id) values($1)", [id]);
  for (const [id, name, role] of [
    [ids.teacher, "hold_teacher", "teacher"],
    [ids.other, "hold_other", "teacher"],
    [ids.child, "hold_child", "child"],
    [ids.loner, "hold_loner", "child"],
  ])
    await pool.query(
      "insert into profiles(id,username,display_name,auth_email,role) values($1,$2,$2,$3,$4)",
      [id, name, `${name}@tests.invalid`, role],
    );
  await pool.query(
    "insert into classes(id,teacher_id,name,invite_code) values($1,$2,'Hold class','HOLD1234')",
    [ids.classId, ids.teacher],
  );
  // Joining a class links the student to the teacher (teacher_builders trigger).
  await pool.query(
    "insert into class_members(class_id,child_id) values($1,$2)",
    [ids.classId, ids.child],
  );
  for (const [project, owner] of [
    ["vm-holdchild", ids.child],
    ["vm-holdloner", ids.loner],
  ])
    await pool.query(
      "insert into projects(vm_id,owner_id,metadata) values($1,$2,'{}')",
      [project, owner],
    );

  // A questionable prompt from a student with a teacher is held.
  const held = await review(
    ids.child,
    "vm-holdchild",
    "make a scary ghost game",
  );
  assert.equal(
    await recordModerationOutcome(pool, held, ids.child, outcome("review")),
    true,
  );
  let row = (
    await pool.query(
      "select decision,hold_status from prompt_reviews where id=$1",
      [held],
    )
  ).rows[0];
  assert.deepEqual(row, { decision: "review", hold_status: "pending" });

  // The student cannot continue until it is approved.
  const content = "make a scary ghost game";
  const same = {
    childId: ids.child,
    conversationId: ids.conversation,
    content,
  };
  assert.equal(await consumeApprovedHold(pool, same), false);

  // Only a teacher of this student can decide, and only on a held prompt.
  assert.equal(
    await decideHold(pool, {
      id: held,
      teacherId: ids.other,
      action: "approve",
    }),
    false,
  );
  assert.equal(
    await decideHold(pool, {
      id: held,
      teacherId: ids.teacher,
      action: "approve",
    }),
    true,
  );
  assert.equal(
    await decideHold(pool, {
      id: held,
      teacherId: ids.teacher,
      action: "deny",
    }),
    false,
  );

  // The approval covers exactly this text, in this conversation, once.
  assert.equal(
    await consumeApprovedHold(pool, { ...same, content: "something else" }),
    false,
  );
  assert.equal(
    await consumeApprovedHold(pool, {
      ...same,
      conversationId: "00000000-0000-4000-8000-0000000000c2",
    }),
    false,
  );
  assert.equal(await consumeApprovedHold(pool, same), true);
  assert.equal(await consumeApprovedHold(pool, same), false);

  // A blocked prompt is recorded for the teacher but can never be approved.
  const blocked = await review(ids.child, "vm-holdchild", "something blocked");
  assert.equal(
    await recordModerationOutcome(pool, blocked, ids.child, outcome("block")),
    false,
  );
  row = (
    await pool.query(
      "select decision,hold_status from prompt_reviews where id=$1",
      [blocked],
    )
  ).rows[0];
  assert.deepEqual(row, { decision: "block", hold_status: null });
  assert.equal(
    await decideHold(pool, {
      id: blocked,
      teacherId: ids.teacher,
      action: "approve",
    }),
    false,
  );

  // With no teacher to approve it, a questionable prompt is not held.
  const solo = await review(
    ids.loner,
    "vm-holdloner",
    "make a scary ghost game",
  );
  assert.equal(
    await recordModerationOutcome(pool, solo, ids.loner, outcome("review")),
    false,
  );
  row = (
    await pool.query(
      "select decision,hold_status from prompt_reviews where id=$1",
      [solo],
    )
  ).rows[0];
  assert.deepEqual(row, { decision: "review", hold_status: null });

  // A denied prompt can be declined and is never released.
  const declined = await review(
    ids.child,
    "vm-holdchild",
    "another ghost idea",
  );
  await recordModerationOutcome(pool, declined, ids.child, outcome("review"));
  assert.equal(
    await decideHold(pool, {
      id: declined,
      teacherId: ids.teacher,
      action: "deny",
    }),
    true,
  );
  assert.equal(
    await consumeApprovedHold(pool, { ...same, content: "another ghost idea" }),
    false,
  );
});
