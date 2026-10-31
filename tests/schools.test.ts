import { setupSchool } from "../lib/school-setup";
import { platformDirectory } from "../lib/platform-directory";
// @suite database
import assert from "node:assert/strict";
import { test, after } from "node:test";
import { createHash } from "node:crypto";
import pg from "pg";
import { APPLICATION_DATABASE_OPTIONS } from "../lib/database-options.mjs";
import { acceptClassroomTeacherInvite } from "../lib/classroom-teachers";
import {
  createSchool,
  createSchoolTeacherInvite,
  listSchools,
  schoolOverview,
} from "../lib/school-admin";
import { administeredSchool, sameSchool, schoolOf } from "../lib/schools";
const pool = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  options: APPLICATION_DATABASE_OPTIONS,
});
(globalThis as unknown as { dreamforgePool: pg.Pool }).dreamforgePool = pool;
after(() => pool.end());
const id = (n: number) =>
  `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`;
const person = {
  admin1: id(1),
  teacher1: id(2),
  student1: id(3),
  admin2: id(4),
  teacher2: id(5),
  student2: id(6),
  independent: id(7),
};
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
test("schools keep their people, classes and data separate", async () => {
  const roles: Record<string, string> = {
    [person.student1]: "child",
    [person.student2]: "child",
  };
  for (const [name, uuid] of Object.entries(person)) {
    await pool.query("insert into auth.users(id) values($1)", [uuid]);
    await pool.query(
      "insert into profiles(id,username,display_name,auth_email,role) values($1,$2,$2,$3,$4)",
      [uuid, `sch_${name}`, `${name}@tests.invalid`, roles[uuid] || "teacher"],
    );
  }
  const a = await createSchool(pool, {
    name: "School A",
    createdBy: person.admin1,
  });
  const b = await createSchool(pool, {
    name: "School B",
    createdBy: person.admin2,
  });
  // A new school comes with a one-use invitation that makes its first administrator.
  const invite = (
    await pool.query(
      "select school_id,make_admin from teacher_invites where token_hash=$1",
      [hash(a.token)],
    )
  ).rows[0];
  assert.deepEqual(invite, { school_id: a.school.id, make_admin: true });
  // Placing people in schools (what signup does for an invitation or class code).
  for (const [who, school] of [
    [person.admin1, a.school.id],
    [person.teacher1, a.school.id],
    [person.student1, a.school.id],
    [person.admin2, b.school.id],
    [person.teacher2, b.school.id],
    [person.student2, b.school.id],
  ])
    await pool.query("update profiles set school_id=$2 where id=$1", [
      who,
      school,
    ]);
  await pool.query(
    "insert into school_admins(school_id,profile_id) values($1,$2),($3,$4)",
    [a.school.id, person.admin1, b.school.id, person.admin2],
  );
  assert.equal(await administeredSchool(pool, person.admin1), a.school.id);
  assert.equal(await administeredSchool(pool, person.teacher1), null);
  assert.equal(await schoolOf(pool, person.independent), null);

  // Each school's overview contains only its own people and classes.
  const classA = (
    await pool.query(
      "insert into classes(teacher_id,name,invite_code) values($1,'A class','SCHA0001') returning id",
      [person.teacher1],
    )
  ).rows[0].id;
  await pool.query(
    "insert into classes(teacher_id,name,invite_code) values($1,'B class','SCHB0001')",
    [person.teacher2],
  );
  await pool.query(
    "insert into class_members(class_id,child_id) values($1,$2)",
    [classA, person.student1],
  );
  const overviewA = (await schoolOverview(pool, a.school.id))!;
  assert.deepEqual(overviewA.teachers.map((t: any) => t.username).sort(), [
    "sch_admin1",
    "sch_teacher1",
  ]);
  assert.deepEqual(
    overviewA.classes.map((c: any) => c.name),
    ["A class"],
  );
  assert.equal(overviewA.students, 1);
  const overviewB = (await schoolOverview(pool, b.school.id))!;
  assert.deepEqual(
    overviewB.classes.map((c: any) => c.name),
    ["B class"],
  );
  const listed = await listSchools(pool);
  assert.equal(listed.find((s: any) => s.name === "School A").teachers, 2);

  // Same-school rule.
  assert.ok(sameSchool(a.school.id, a.school.id) && sameSchool(null, null));
  assert.ok(
    !sameSchool(a.school.id, b.school.id) && !sameSchool(a.school.id, null),
  );

  // A co-teacher invitation only works for a teacher in the same school.
  const co = "coteacher-invite-token-aaaaaaaa1";
  await pool.query(
    "insert into teacher_invites(token_hash,created_by,classroom_id) values($1,$2,$3)",
    [hash(co), person.teacher1, classA],
  );
  const asProfile = (uuid: string, name: string) => ({
    id: uuid,
    username: name,
    display_name: name,
    role: "teacher" as const,
  });
  assert.equal(
    await acceptClassroomTeacherInvite(
      co,
      asProfile(person.teacher2, "sch_teacher2"),
    ),
    null,
  );
  assert.equal(
    await acceptClassroomTeacherInvite(
      co,
      asProfile(person.independent, "sch_independent"),
    ),
    null,
  );
  assert.equal(
    await acceptClassroomTeacherInvite(
      co,
      asProfile(person.admin1, "sch_admin1"),
    ),
    classA,
  );

  const expanded = (await schoolOverview(pool, a.school.id))!;
  assert.equal(expanded.classes[0].teachers.length, 2);
  assert.deepEqual(
    expanded.classes[0].roster.map((p: any) => p.id),
    [person.student1],
  );
  assert.equal(
    expanded.teachers.find((p: any) => p.id === person.admin1).classes,
    1,
  );
  for (const [vm, child] of [
    ["vm-schoolalerta", person.student1],
    ["vm-schoolalertb", person.student2],
  ]) {
    await pool.query(
      "insert into projects(vm_id,owner_id,metadata) values($1,$2,'{}')",
      [vm, child],
    );
    await pool.query(
      "insert into prompt_reviews(vm_id,child_id,conversation_id,content,decision,categories,severity,hold_status,reviewed_by,reviewed_at) values($1,$2,'00000000-0000-4000-8000-000000000099','sample request','review','{}','medium','approved',$3,now()),($1,$2,'00000000-0000-4000-8000-000000000099','blocked request','block','{}','high',null,null,null)",
      [vm, child, vm.endsWith("a") ? person.teacher1 : person.teacher2],
    );
  }
  const safetyA = (await schoolOverview(pool, a.school.id))!.alerts;
  assert.equal(safetyA.length, 2);
  assert.ok(safetyA.every((r: any) => r.child_id === person.student1));
  assert.ok(
    safetyA.some(
      (r: any) =>
        r.hold_status === "approved" && r.reviewer_name === "sch_teacher1",
    ),
  );
  assert.ok(safetyA.some((r: any) => r.decision === "block"));

  // A school administrator can create further invitations only for their own school.
  const token = await createSchoolTeacherInvite(pool, {
    schoolId: a.school.id,
    createdBy: person.admin1,
    makeAdmin: false,
  });
  const row = (
    await pool.query(
      "select school_id,make_admin from teacher_invites where token_hash=$1",
      [hash(token)],
    )
  ).rows[0];
  assert.deepEqual(row, { school_id: a.school.id, make_admin: false });
  const setup = (actor: string, input: Record<string, unknown>) =>
    setupSchool(pool, actor, a.school.id, input);
  assert.equal(
    await setup(person.teacher1, {
      action: "createClass",
      teacherId: person.teacher1,
      name: "Forbidden",
    }),
    false,
  );
  assert.equal(
    await setup(person.admin2, {
      action: "createClass",
      teacherId: person.teacher1,
      name: "Forbidden",
    }),
    false,
  );
  assert.equal(
    await setup(person.admin1, {
      action: "createClass",
      teacherId: person.teacher2,
      name: "Forbidden",
    }),
    false,
  );
  assert.equal(
    await setup(person.admin1, {
      action: "createClass",
      teacherId: person.teacher1,
      name: "New classroom",
    }),
    true,
  );
  const newClass = (
    await pool.query("select id from classes where name='New classroom'")
  ).rows[0].id;
  assert.equal(
    await setup(person.admin1, {
      action: "enrollStudent",
      classId: newClass,
      personId: person.student2,
    }),
    false,
  );
  assert.equal(
    await setup(person.admin1, {
      action: "enrollStudent",
      classId: newClass,
      personId: person.student1,
    }),
    true,
  );
  assert.equal(
    await setup(person.admin1, {
      action: "addTeacher",
      classId: newClass,
      personId: person.teacher2,
    }),
    false,
  );
  assert.equal(
    await setup(person.admin1, {
      action: "addTeacher",
      classId: newClass,
      personId: person.admin1,
    }),
    true,
  );
  // The school admin is not automatically made a classroom teacher when setting it up.
  assert.equal(
    (await pool.query("select teacher_id from classes where id=$1", [newClass]))
      .rows[0].teacher_id,
    person.teacher1,
  );
  await pool.query(
    "insert into project_members(vm_id,child_id) values('vm-schoolalerta',$1)",
    [person.student1],
  );
  const directory = await platformDirectory(pool);
  assert.ok(directory.students.some((p) => p.id === person.student1));
  assert.ok(directory.students.some((p) => p.id === person.student2));
  assert.ok(
    directory.teachers.some(
      (p) => p.id === person.independent && p.school_id === null,
    ),
  );
  assert.ok(
    directory.classrooms.some(
      (c) => c.id === newClass && c.students === "sch_student1",
    ),
  );
  assert.ok(
    directory.groups.some(
      (g) =>
        g.id === "vm-schoolalerta" &&
        g.members === "sch_student1" &&
        g.editor === "sch_student1",
    ),
  );
  assert.ok(!("auth_email" in directory.teachers[0]));
  // The database refuses an admin invitation that has no school.
  await assert.rejects(
    pool.query(
      "insert into teacher_invites(token_hash,created_by,make_admin) values('x',$1,true)",
      [person.admin1],
    ),
  );
});
