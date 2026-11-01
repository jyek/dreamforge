// @suite database
import assert from "node:assert/strict";
import { test, after } from "node:test";
import pg from "pg";
import { APPLICATION_DATABASE_OPTIONS } from "../lib/database-options.mjs";
import {
  addMember,
  groupView,
  setEditor,
  removeMember,
} from "../lib/project-group";
import { decideHold } from "../lib/prompt-hold";
import { schoolOverview } from "../lib/school-admin";
import { teacherStudentAccessSQL } from "../lib/classroom-permissions";
const db = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  options: APPLICATION_DATABASE_OPTIONS,
});
after(() => db.end());
const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
test("school roles manage only their scope; only classroom teachers approve; students pass control", async () => {
  const school = id(1),
    otherSchool = id(2),
    admin = id(3),
    teacher = id(4),
    owner = id(5),
    peer = id(6),
    foreign = id(7),
    foreignAdmin = id(8),
    formerTeacher = id(9),
    classroom = id(10);
  await db.query(
    "insert into schools(id,name) values($1,'Roles A'),($2,'Roles B')",
    [school, otherSchool],
  );
  for (const [person, role, scope] of [
    [admin, "teacher", school],
    [teacher, "teacher", school],
    [owner, "child", school],
    [peer, "child", school],
    [foreign, "child", otherSchool],
    [foreignAdmin, "teacher", otherSchool],
    [formerTeacher, "teacher", school],
  ]) {
    await db.query("insert into auth.users(id) values($1)", [person]);
    await db.query(
      "insert into profiles(id,username,display_name,auth_email,role,school_id) values($1,$2,$2,$3,$4,$5)",
      [
        person,
        `role_${String(person).slice(-3)}`,
        `${person}@test.invalid`,
        role,
        scope,
      ],
    );
  }
  await db.query(
    "insert into school_admins(school_id,profile_id) values($1,$2),($3,$4)",
    [school, admin, otherSchool, foreignAdmin],
  );
  assert.ok(
    (
      await db.query("select role from account_roles where profile_id=$1", [
        admin,
      ])
    ).rows.some((r) => r.role === "school_admin"),
  );
  assert.ok(
    !(
      await db.query("select role from account_roles where profile_id=$1", [
        owner,
      ])
    ).rows.some((r) => r.role === "school_admin"),
  );
  await assert.rejects(
    db.query("insert into school_admins(school_id,profile_id) values($1,$2)", [
      school,
      foreignAdmin,
    ]),
  );
  await db.query(
    "insert into classes(id,teacher_id,name,invite_code) values($1,$2,'Roles class','ROLESTEST')",
    [classroom, teacher],
  );
  await db.query(
    "insert into class_members(class_id,child_id) values($1,$2),($1,$3)",
    [classroom, owner, peer],
  );
  await db.query(
    "insert into teacher_builders(teacher_id,child_id) values($1,$2) on conflict do nothing",
    [formerTeacher, owner],
  );
  assert.equal(
    (
      await db.query(`select 1 where ${teacherStudentAccessSQL("$2")}`, [
        formerTeacher,
        owner,
      ])
    ).rowCount,
    0,
  );
  await db.query(
    "insert into projects(vm_id,owner_id,metadata) values('vm-rolepermissions',$1,'{}')",
    [owner],
  );
  const add = (actorId: string, childId = peer) =>
    addMember(db, {
      vmId: "vm-rolepermissions",
      childId,
      actorId,
      classId: classroom,
    });
  assert.equal((await add(owner)).ok, false);
  assert.equal((await add(formerTeacher)).ok, false);
  assert.equal((await add(foreignAdmin)).ok, false);
  assert.equal((await add(admin, foreign)).ok, false);
  assert.equal((await add(admin)).ok, true);
  assert.equal(
    (await groupView(db, "vm-rolepermissions", admin))!.canManage,
    true,
  );
  assert.equal(
    (
      await setEditor(db, {
        vmId: "vm-rolepermissions",
        actorId: owner,
        editorId: peer,
      })
    ).ok,
    true,
  );
  assert.equal(
    (
      await setEditor(db, {
        vmId: "vm-rolepermissions",
        actorId: owner,
        editorId: owner,
      })
    ).ok,
    false,
  );
  assert.equal(
    (
      await setEditor(db, {
        vmId: "vm-rolepermissions",
        actorId: peer,
        editorId: owner,
      })
    ).ok,
    true,
  );
  assert.equal(
    (
      await db.query(
        "select revision from project_execution where project_id='vm-rolepermissions'",
      )
    ).rows[0].revision,
    "2",
  );
  const reviews = (
    await db.query(
      "insert into prompt_reviews(vm_id,child_id,conversation_id,content,decision,categories,severity,hold_status) values('vm-rolepermissions',$1,$2,'review me','review','{}','medium','pending'),('vm-rolepermissions',$1,$2,'unsafe','block','{}','high',null) returning id,decision",
      [owner, id(11)],
    )
  ).rows;
  const pending = reviews.find((r) => r.decision === "review").id;
  assert.equal(
    await decideHold(db, {
      id: pending,
      teacherId: admin,
      classId: classroom,
      action: "approve",
    }),
    false,
  );
  assert.equal(
    await decideHold(db, {
      id: pending,
      teacherId: formerTeacher,
      classId: classroom,
      action: "approve",
    }),
    false,
  );
  assert.equal(
    await decideHold(db, {
      id: pending,
      teacherId: teacher,
      classId: classroom,
      action: "approve",
    }),
    true,
  );
  assert.equal(
    await decideHold(db, {
      id: reviews.find((r) => r.decision === "block").id,
      teacherId: teacher,
      classId: classroom,
      action: "approve",
    }),
    false,
  );
  const overview = await schoolOverview(db, school);
  assert.ok(
    overview!.alerts.some(
      (r: { hold_status: string | null }) => r.hold_status === "approved",
    ),
  );
  assert.ok(
    overview!.alerts.some((r: { decision: string }) => r.decision === "block"),
  );
  assert.equal((await schoolOverview(db, otherSchool))!.alerts.length, 0);
  assert.equal(
    (
      await removeMember(db, {
        vmId: "vm-rolepermissions",
        childId: peer,
        actorId: teacher,
      })
    ).ok,
    true,
  );
  assert.equal(
    (await groupView(db, "vm-rolepermissions", peer))!.isMember,
    false,
  );
});
