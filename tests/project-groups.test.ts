// @suite database
import assert from "node:assert/strict";
import { test, after } from "node:test";
import pg from "pg";
import { APPLICATION_DATABASE_OPTIONS } from "../lib/database-options.mjs";
import {
  addMember,
  groupNames,
  groupView,
  removeMember,
  setEditor,
} from "../lib/project-group";
const pool = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  options: APPLICATION_DATABASE_OPTIONS,
});
(globalThis as unknown as { dreamforgePool: pg.Pool }).dreamforgePool = pool;
after(() => pool.end());
const id = (n: number) =>
  `00000000-0000-4000-8000-0000000002${String(n).padStart(2, "0")}`;
const p = {
  teacher: id(1),
  otherTeacher: id(2),
  owner: id(3),
  bea: id(4),
  cal: id(5),
  outsider: id(6),
  otherClassKid: id(7),
};
const vm = "vm-groupproject";
test("group projects: one editor, classmates only, teacher can manage", async () => {
  for (const [name, uuid] of Object.entries(p)) {
    await pool.query("insert into auth.users(id) values($1)", [uuid]);
    await pool.query(
      "insert into profiles(id,username,display_name,auth_email,role) values($1,$2,$3,$4,$5)",
      [
        uuid,
        `grp_${name.toLowerCase()}`,
        name,
        `${name}@tests.invalid`,
        /teacher/i.test(name) ? "teacher" : "child",
      ],
    );
  }
  const classId = (
    await pool.query(
      "insert into classes(teacher_id,name,invite_code) values($1,'G1','GRPCLS01') returning id",
      [p.teacher],
    )
  ).rows[0].id;
  const otherClass = (
    await pool.query(
      "insert into classes(teacher_id,name,invite_code) values($1,'G2','GRPCLS02') returning id",
      [p.otherTeacher],
    )
  ).rows[0].id;
  for (const kid of [p.owner, p.bea, p.cal])
    await pool.query(
      "insert into class_members(class_id,child_id) values($1,$2)",
      [classId, kid],
    );
  await pool.query(
    "insert into class_members(class_id,child_id) values($1,$2)",
    [otherClass, p.otherClassKid],
  );
  await pool.query(
    "insert into projects(vm_id,owner_id,metadata) values($1,$2,'{}')",
    [vm, p.owner],
  );

  // Only classmates of the owner can be added; students outside the class cannot.
  const add = (childId: string, actorId: string) =>
    addMember(pool, { vmId: vm, childId, actorId });
  assert.deepEqual(await add(p.outsider, p.owner), {
    ok: false,
    status: 400,
    error: "Only classmates can join this group.",
  });
  assert.equal((await add(p.otherClassKid, p.owner)).ok, false);
  assert.equal((await add(p.owner, p.owner)).ok, false);
  // A group member cannot add people; another class's teacher cannot either.
  assert.equal((await add(p.bea, p.cal)).ok, false);
  assert.equal((await add(p.bea, p.otherTeacher)).ok, false);
  assert.equal((await add(p.bea, p.owner)).ok, true);
  // The owner's teacher can.
  assert.equal((await add(p.cal, p.teacher)).ok, true);
  assert.deepEqual(
    (await groupNames(pool, [vm])).get(vm),
    ["bea", "cal"],
  );

  // The owner edits first. Pass the pen to Bea; now only Bea may pass it on.
  let view = (await groupView(pool, vm, p.owner))!;
  assert.equal(view.editorId, p.owner);
  const pass = (editorId: string, actorId: string) =>
    setEditor(pool, { vmId: vm, editorId, actorId });
  assert.equal((await pass(p.bea, p.cal)).ok, false); // Cal is neither the editor nor the owner
  assert.equal((await pass(p.bea, p.owner)).ok, true);
  assert.equal((await groupView(pool, vm, p.bea))!.editorId, p.bea);
  assert.equal((await pass(p.cal, p.bea)).ok, true);
  assert.equal((await pass(p.outsider, p.cal)).ok, false); // not in the group
  assert.equal((await pass(p.owner, p.cal)).ok, true); // back to the owner (stored as null)
  assert.equal(
    (await pool.query("select editor_id from projects where vm_id=$1", [vm]))
      .rows[0].editor_id,
    null,
  );

  // The pen cannot move while a request is running.
  await pool.query(
    "insert into project_execution(project_id,active_run) values($1,gen_random_uuid())",
    [vm],
  );
  const busy = await pass(p.bea, p.owner);
  assert.equal(busy.ok, false);
  assert.equal(busy.ok === false && busy.status, 409);
  await pool.query(
    "update project_execution set active_run=null where project_id=$1",
    [vm],
  );

  // Removing the person who is editing hands the project back to the owner.
  assert.equal((await pass(p.bea, p.owner)).ok, true);
  assert.equal(
    (await removeMember(pool, { vmId: vm, childId: p.bea, actorId: p.owner }))
      .ok,
    true,
  );
  view = (await groupView(pool, vm, p.owner))!;
  assert.equal(view.editorId, p.owner);
  assert.deepEqual(
    view.members.map((m) => m.id),
    [p.cal],
  );
  // A member can leave on their own, but cannot remove someone else.
  assert.equal(
    (await removeMember(pool, { vmId: vm, childId: p.owner, actorId: p.cal }))
      .ok,
    false,
  );
  assert.equal(
    (await removeMember(pool, { vmId: vm, childId: p.cal, actorId: p.cal })).ok,
    true,
  );
  // Candidates exclude people already in the group.
  assert.ok(
    !(await groupView(pool, vm, p.owner))!.candidates.some(
      (c) => c.id === p.owner,
    ),
  );
});
