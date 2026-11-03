// @suite database
import assert from "node:assert/strict";
import { test, after } from "node:test";
import pg from "pg";
import { APPLICATION_DATABASE_OPTIONS } from "../lib/database-options.mjs";
import { SafetyError } from "../lib/kids-safety";
import {
  consumeApprovedHold,
  approvalClassroomsSQL,
  decideHold,
  recordModerationOutcome,
  requestPromptApproval,
  studentPromptApprovals,
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
test("classified rejections require a student request before either classroom teacher can approve once", async () => {
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

  const request = (
    id: string,
    childId = ids.child,
    projectId = "vm-holdchild",
  ) =>
    requestPromptApproval(pool, {
      id,
      childId,
      projectId,
      conversationId: ids.conversation,
    });
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
  assert.deepEqual(row, { decision: "review", hold_status: null });
  assert.equal(
    await decideHold(pool, {
      id: held,
      teacherId: ids.teacher,
      classId: ids.classId,
      action: "approve",
    }),
    false,
  );
  assert.equal(await request(held, ids.loner), null);
  assert.equal(
    await requestPromptApproval(pool, {
      id: held,
      childId: ids.child,
      projectId: "vm-wrong",
      conversationId: ids.conversation,
    }),
    null,
  );
  const requested = await Promise.all([request(held), request(held)]);
  assert.equal(requested.filter(Boolean).length, 1);
  assert.equal(
    (
      await studentPromptApprovals(pool, {
        childId: ids.child,
        projectId: "vm-holdchild",
        conversationId: ids.conversation,
      })
    ).find((p) => p.id === held).status,
    "pending",
  );

  // The student cannot continue until it is approved.
  const content = "make a scary ghost game";
  const same = {
    childId: ids.child,
    projectId: "vm-holdchild",
    conversationId: ids.conversation,
    content,
  };
  assert.equal(await consumeApprovedHold(pool, same), false);

  const eligibleClasses = async (actor: string, child = ids.child) =>
    (
      await pool.query(
        `select ${approvalClassroomsSQL("$2", "$1")} as classrooms`,
        [actor, child],
      )
    ).rows[0].classrooms;
  assert.deepEqual(
    (await eligibleClasses(ids.teacher)).map((c: { id: string }) => c.id),
    [ids.classId],
  );
  assert.deepEqual(await eligibleClasses(ids.other), []);
  // Only a teacher of this student can decide, and only on a held prompt.
  assert.equal(
    await decideHold(pool, {
      id: held,
      teacherId: ids.other,
      action: "approve",
      classId: ids.classId,
    }),
    false,
  );
  assert.equal(
    await decideHold(pool, {
      id: held,
      teacherId: ids.teacher,
      action: "approve",
      classId: ids.classId,
    }),
    true,
  );
  assert.equal(
    await decideHold(pool, {
      id: held,
      teacherId: ids.teacher,
      action: "deny",
      classId: ids.classId,
    }),
    false,
  );

  // A legacy teacher link alone cannot authorize a classroom approval.
  await pool.query(
    "insert into teacher_builders(teacher_id,child_id) values($1,$2) on conflict do nothing",
    [ids.other, ids.child],
  );
  const restricted = await review(
    ids.child,
    "vm-holdchild",
    "classroom approval only",
  );
  await recordModerationOutcome(pool, restricted, ids.child, outcome("review"));
  await request(restricted);
  assert.equal(
    await decideHold(pool, {
      id: restricted,
      teacherId: ids.other,
      classId: ids.classId,
      action: "approve",
    }),
    false,
  );
  assert.equal(
    await decideHold(pool, {
      id: restricted,
      teacherId: ids.teacher,
      classId: ids.conversation,
      action: "approve",
    }),
    false,
  );
  await pool.query(
    "insert into class_teachers(class_id,teacher_id,added_by) values($1,$2,$3)",
    [ids.classId, ids.other, ids.teacher],
  );
  assert.equal(
    await decideHold(pool, {
      id: restricted,
      teacherId: ids.other,
      classId: ids.classId,
      action: "approve",
    }),
    true,
  );
  assert.deepEqual(
    (await eligibleClasses(ids.other)).map((c: { id: string }) => c.id),
    [ids.classId],
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
  assert.equal(
    await consumeApprovedHold(pool, { ...same, projectId: "vm-otherproject" }),
    false,
  );
  const attempts = await Promise.all([
    consumeApprovedHold(pool, same),
    consumeApprovedHold(pool, same),
  ]);
  assert.deepEqual(attempts.sort(), [false, true]);
  assert.equal(await consumeApprovedHold(pool, same), false);

  // A blocked classification also stays blocked until the student requests it.
  const blocked = await review(ids.child, "vm-holdchild", "something blocked");
  assert.equal(
    await recordModerationOutcome(pool, blocked, ids.child, outcome("block")),
    true,
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
      classId: ids.classId,
    }),
    false,
  );

  assert.ok(await request(blocked));
  assert.equal(
    await decideHold(pool, {
      id: blocked,
      teacherId: ids.other,
      classId: ids.classId,
      action: "approve",
    }),
    true,
  );
  assert.equal(await request(blocked), null);
  assert.equal(
    await consumeApprovedHold(pool, { ...same, content: "something blocked" }),
    true,
  );
  assert.equal(
    await consumeApprovedHold(pool, { ...same, content: "something blocked" }),
    false,
  );
  assert.equal(
    (
      await pool.query("select decision from prompt_reviews where id=$1", [
        blocked,
      ])
    ).rows[0].decision,
    "block",
  );
  // Even a legacy teacher link does not enable approval without classroom membership.
  await pool.query(
    "insert into teacher_builders(teacher_id,child_id) values($1,$2) on conflict do nothing",
    [ids.teacher, ids.loner],
  );
  assert.deepEqual(await eligibleClasses(ids.teacher, ids.loner), []);
  // With no classroom teacher to approve it, a questionable prompt is not held.
  const solo = await review(
    ids.loner,
    "vm-holdloner",
    "make a scary ghost game",
  );
  assert.equal(
    await recordModerationOutcome(pool, solo, ids.loner, outcome("review")),
    true,
  );
  row = (
    await pool.query(
      "select decision,hold_status from prompt_reviews where id=$1",
      [solo],
    )
  ).rows[0];
  assert.deepEqual(row, { decision: "review", hold_status: null });
  assert.equal(
    await decideHold(pool, {
      id: solo,
      teacherId: ids.teacher,
      classId: ids.classId,
      action: "approve",
    }),
    false,
  );

  assert.equal(await request(solo, ids.loner, "vm-holdloner"), null);
  assert.equal(
    (
      await studentPromptApprovals(pool, {
        childId: ids.loner,
        projectId: "vm-holdloner",
        conversationId: ids.conversation,
      })
    )[0].can_request,
    false,
  );
  const unclassified = await review(
    ids.child,
    "vm-holdchild",
    "provider unavailable",
  );
  await recordModerationOutcome(
    pool,
    unclassified,
    ids.child,
    new SafetyError("unavailable", "unavailable"),
  );
  assert.equal(await request(unclassified), null);
  // A denied prompt can be declined and is never released.
  const declined = await review(
    ids.child,
    "vm-holdchild",
    "another ghost idea",
  );
  await recordModerationOutcome(pool, declined, ids.child, outcome("review"));
  await request(declined);
  assert.equal(
    await decideHold(pool, {
      id: declined,
      teacherId: ids.teacher,
      action: "deny",
      classId: ids.classId,
    }),
    true,
  );
  assert.equal(
    await consumeApprovedHold(pool, { ...same, content: "another ghost idea" }),
    false,
  );
  assert.equal(await request(declined), null);
  const departed = await review(
    ids.child,
    "vm-holdchild",
    "a request before leaving class",
  );
  await recordModerationOutcome(pool, departed, ids.child, outcome("review"));
  await request(departed);
  assert.equal(
    await decideHold(pool, {
      id: departed,
      teacherId: ids.teacher,
      classId: ids.classId,
      action: "approve",
    }),
    true,
  );
  await pool.query(
    "delete from class_members where class_id=$1 and child_id=$2",
    [ids.classId, ids.child],
  );
  assert.equal(
    await consumeApprovedHold(pool, {
      ...same,
      content: "a request before leaving class",
    }),
    false,
  );
  assert.deepEqual(await eligibleClasses(ids.teacher), []);
});
