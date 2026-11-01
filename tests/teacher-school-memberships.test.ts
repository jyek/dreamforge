// @suite database
import assert from "node:assert/strict";
import { test, after } from "node:test";
import { randomUUID, createHash } from "node:crypto";
import pg from "pg";
import { APPLICATION_DATABASE_OPTIONS } from "../lib/database-options.mjs";
import {
  addDirectoryPerson,
  searchDirectoryPeople,
} from "../lib/people-directory";
import { schoolOverview, listSchools } from "../lib/school-admin";
import { setupSchool } from "../lib/school-setup";
import { classroomAccess } from "../lib/classroom-data";
import { acceptClassroomTeacherInvite } from "../lib/classroom-teachers";
import { decideHold } from "../lib/prompt-hold";
import { platformDirectory } from "../lib/platform-directory";
import {
  createStudentSchoolInvite,
  lockStudentSchoolInvite,
} from "../lib/student-invites";

const db = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  options: APPLICATION_DATABASE_OPTIONS,
});
(globalThis as any).dreamforgePool = db;
after(() => db.end());

test("teachers can be found globally and join multiple schools without moving their existing classes or inheriting admin access", async () => {
  const schoolA = randomUUID(),
    schoolB = randomUUID();
  await db.query(
    "insert into schools(id,name) values($1,'Membership North'),($2,'Membership South')",
    [schoolA, schoolB],
  );
  const admin = randomUUID(),
    teacher = randomUUID(),
    newcomer = randomUUID(),
    child = randomUUID(),
    childB = randomUUID();
  for (const [id, username, role, school] of [
    [admin, "membership_admin", "teacher", schoolA],
    [teacher, "membership_stacey_teacher", "teacher", schoolB],
    [newcomer, "membership_invitee", "teacher", schoolB],
    [child, "membership_child", "child", schoolA],
    [childB, "membership_child_south", "child", schoolB],
  ]) {
    await db.query("insert into auth.users(id) values($1)", [id]);
    await db.query(
      "insert into profiles(id,username,display_name,auth_email,role,school_id) values($1,$2,$2,$2||'@tests.invalid',$3,$4)",
      [id, username, role, school],
    );
  }
  await db.query(
    "insert into school_admins(school_id,profile_id) values($1,$2),($3,$4)",
    [schoolA, admin, schoolB, teacher],
  );
  const createClass = async (owner: string, name: string) =>
    (
      await db.query(
        "insert into classes(teacher_id,name,invite_code) values($1,$2,$3) returning id",
        [owner, name, randomUUID()],
      )
    ).rows[0].id;
  const classA = await createClass(admin, "North classroom");
  const otherClassA = await createClass(admin, "North private classroom");
  const classB = await createClass(teacher, "South classroom");
  const profile = (id: string) =>
    ({ id, role: "teacher", username: "test", display_name: "test" }) as const;

  for (const identifier of [
    "stacey",
    "@membership_stacey_teacher",
    "MEMBERSHIP_STACEY_TEACHER@TESTS.INVALID",
  ]) {
    const matches = await searchDirectoryPeople(db, admin, {
      role: "teacher",
      identifier,
    });
    assert.ok(matches.some((p) => p.id === teacher));
    assert.ok(
      matches.every((p) => !("auth_email" in p) && p.eligible !== false),
    );
  }
  assert.deepEqual(
    await searchDirectoryPeople(db, admin, {
      role: "teacher",
      identifier: "membership_child",
    }),
    [],
  );
  assert.ok(
    !(
      await searchDirectoryPeople(db, admin, {
        role: "student",
        identifier: "membership_child",
      })
    ).some((p) => p.id === childB),
  );
  const add = (classId?: string) =>
    addDirectoryPerson(db, admin, {
      action: "add",
      role: "teacher",
      identifier: "membership_stacey_teacher",
      classId,
    });
  await add();
  await add();
  assert.equal(
    (await db.query("select school_id from profiles where id=$1", [teacher]))
      .rows[0].school_id,
    schoolB,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n from school_teachers where teacher_id=$1",
        [teacher],
      )
    ).rows[0].n,
    2,
  );
  assert.equal(
    await classroomAccess(classA, profile(teacher), db),
    null,
    "School membership alone must not grant classroom access",
  );
  const overviewA = (await schoolOverview(db, schoolA))!;
  const overviewB = (await schoolOverview(db, schoolB))!;
  assert.equal(
    overviewA.teachers.find((p: any) => p.id === teacher).is_admin,
    false,
  );
  assert.equal(
    overviewB.teachers.find((p: any) => p.id === teacher).is_admin,
    true,
  );
  assert.equal(
    (await listSchools(db)).find((s) => s.id === schoolA).teachers,
    2,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n from school_admins where profile_id=$1",
        [teacher],
      )
    ).rows[0].n,
    1,
  );

  await add(classA);
  await add(classA);
  const classInvite = await createStudentSchoolInvite(db, teacher, classA);
  assert.equal(
    (await lockStudentSchoolInvite(db, classInvite)).school_id,
    schoolA,
  );
  const defaultInvite = await createStudentSchoolInvite(db, teacher);
  assert.equal(
    (await lockStudentSchoolInvite(db, defaultInvite)).school_id,
    schoolB,
  );
  assert.ok(await classroomAccess(classA, profile(teacher), db));
  assert.ok(await classroomAccess(classB, profile(teacher), db));
  assert.equal(await classroomAccess(otherClassA, profile(teacher), db), null);
  assert.equal(
    (await db.query("select school_id from classes where id=$1", [classB]))
      .rows[0].school_id,
    schoolB,
  );
  await assert.rejects(
    addDirectoryPerson(db, newcomer, {
      action: "add",
      role: "teacher",
      identifier: "membership_stacey_teacher",
      classId: otherClassA,
    }),
  );
  await assert.rejects(
    addDirectoryPerson(db, admin, {
      action: "add",
      role: "student",
      identifier: "membership_child_south",
      classId: classA,
    }),
  );

  assert.equal(
    await setupSchool(db, admin, schoolA, {
      action: "createClass",
      teacherId: teacher,
      name: "Shared lead teacher",
    }),
    true,
  );
  const leadClass = (
    await db.query(
      "select id,school_id from classes where teacher_id=$1 and name='Shared lead teacher'",
      [teacher],
    )
  ).rows[0];
  assert.equal(leadClass.school_id, schoolA);
  assert.ok(await classroomAccess(leadClass.id, profile(admin), db));
  assert.ok(
    !(await schoolOverview(db, schoolB))!.classes.some(
      (c: any) => c.id === leadClass.id,
    ),
  );
  assert.equal(
    await setupSchool(db, admin, schoolA, {
      action: "enrollStudent",
      classId: leadClass.id,
      personId: child,
    }),
    true,
  );
  await addDirectoryPerson(db, teacher, {
    action: "add",
    role: "student",
    identifier: "membership_child",
    classId: leadClass.id,
  });

  await db.query("insert into class_members(class_id,child_id) values($1,$2)", [
    classA,
    child,
  ]);
  const vm = `vm-${randomUUID().replaceAll("-", "")}`;
  await db.query(
    "insert into projects(vm_id,owner_id,metadata) values($1,$2,'{}')",
    [vm, child],
  );
  const review = (
    await db.query(
      "insert into prompt_reviews(vm_id,child_id,conversation_id,content,decision,categories,severity,hold_status) values($1,$2,$3,'flagged test','review','{}','medium','pending') returning id",
      [vm, child, randomUUID()],
    )
  ).rows[0].id;
  assert.equal(
    await decideHold(db, {
      teacherId: teacher,
      id: review,
      classId: classA,
      action: "approve",
    }),
    true,
  );

  const token = randomUUID().replaceAll("-", "");
  const hash = createHash("sha256").update(token).digest("hex");
  await db.query(
    "insert into teacher_invites(token_hash,created_by,classroom_id,school_id) values($1,$2,$3,$4)",
    [hash, admin, classA, schoolA],
  );
  assert.equal(
    await acceptClassroomTeacherInvite(token, profile(newcomer)),
    classA,
  );
  assert.equal(
    (await db.query("select school_id from profiles where id=$1", [newcomer]))
      .rows[0].school_id,
    schoolB,
  );
  assert.equal(
    await acceptClassroomTeacherInvite(token, profile(teacher)),
    null,
    "Used invite cannot grant access to another teacher",
  );
  const directory = await platformDirectory(db);
  assert.equal(
    directory.teachers.find((p: any) => p.id === teacher).school,
    "Membership North, Membership South",
  );
  assert.equal(
    directory.classrooms.find((c) => c.id === leadClass.id).school,
    "Membership North",
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n from account_roles where profile_id=$1 and role='teacher'",
        [teacher],
      )
    ).rows[0].n,
    2,
  );
  assert.equal(
    (
      await db.query(
        "select relrowsecurity from pg_class where oid='school_teachers'::regclass",
      )
    ).rows[0].relrowsecurity,
    true,
  );
  for (const role of ["anon", "authenticated"])
    assert.equal(
      (
        await db.query(
          "select has_table_privilege($1,'school_teachers','SELECT,INSERT,UPDATE,DELETE') as allowed",
          [role],
        )
      ).rows[0].allowed,
      false,
    );
});
