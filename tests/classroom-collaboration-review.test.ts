// @suite database
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { APPLICATION_DATABASE_OPTIONS } from "../lib/database-options.mjs";
import {
  changeClassroomGroups,
  shareGroupProject,
} from "../lib/classroom-groups";
import {
  projectGroupMemberSQL,
  groupView,
  setEditor,
  groupNames,
  addMember,
} from "../lib/project-group";
import { classroomData, assignClassroomProject } from "../lib/classroom-data";
import { addDirectoryPerson } from "../lib/people-directory";
import { loadDashboardData } from "../lib/platform-dashboard-data";
const db = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  options: APPLICATION_DATABASE_OPTIONS,
});
(globalThis as unknown as { dreamforgePool: pg.Pool }).dreamforgePool = db;
after(() => db.end());
async function fixture() {
  const school = randomUUID(),
    teacher = randomUUID(),
    owner = randomUUID(),
    peer = randomUUID(),
    other = randomUUID(),
    conversation = randomUUID(),
    classId = randomUUID(),
    group = randomUUID(),
    secondGroup = randomUUID(),
    project = "vm-" + randomUUID().replaceAll("-", "");
  await db.query("insert into schools(id,name) values($1,'Review school')", [
    school,
  ]);
  for (const [id, role] of [
    [teacher, "teacher"],
    [owner, "child"],
    [peer, "child"],
    [other, "child"],
  ]) {
    await db.query("insert into auth.users(id) values($1)", [id]);
    await db.query(
      "insert into profiles(id,username,display_name,auth_email,role,school_id) values($1,$2,$2,$2||'@tests.invalid',$3,$4)",
      [id, "review_" + id.replaceAll("-", "").slice(0, 16), role, school],
    );
  }
  await db.query(
    "insert into classes(id,teacher_id,name,invite_code) values($1,$2,'Review classroom',$3)",
    [classId, teacher, randomUUID()],
  );
  for (const child of [owner, peer, other])
    await db.query(
      "insert into class_members(class_id,child_id) values($1,$2)",
      [classId, child],
    );
  await db.query(
    "insert into classroom_groups(id,class_id,name,category) values($1,$3,'Foxes','Nature & Animals'),($2,$3,'Owls','Nature & Animals')",
    [group, secondGroup, classId],
  );
  for (const child of [owner, peer])
    await db.query(
      "insert into classroom_group_members(class_id,child_id,group_id) values($1,$2,$3)",
      [classId, child, group],
    );
  await db.query(
    "insert into projects(vm_id,owner_id,metadata) values($1,$2,$3)",
    [
      project,
      owner,
      { name: "Review project", conversations: [{ id: conversation }] },
    ],
  );
  await db.query(
    "insert into class_projects(class_id,vm_id,assigned_by) values($1,$2,$3)",
    [classId, project, owner],
  );
  await shareGroupProject(db, classId, owner, project, group);
  const profile = (id: string) => ({
    id,
    username: "fixture",
    display_name: "Fixture",
    role: "child" as const,
  });
  const access = async (id: string) =>
    !!(
      await db.query(
        `select 1 from projects p where p.vm_id=$1 and ${projectGroupMemberSQL("p", "$2")}`,
        [project, id],
      )
    ).rowCount;
  return {
    school,
    teacher,
    owner,
    peer,
    other,
    conversation,
    classId,
    group,
    secondGroup,
    project,
    profile,
    access,
  };
}
test("students see classroom groups and rosters but cannot move themselves or classmates", async () => {
  const f = await fixture();
  const data = (await classroomData(f.classId, f.profile(f.owner), db))!;
  assert.deepEqual(
    new Set(data.groups.map((g) => g.name)),
    new Set(["Foxes", "Owls"]),
  );
  assert.equal(data.students.find((s) => s.id === f.owner)?.group_id, f.group);
  assert.equal(data.students.find((s) => s.id === f.peer)?.group_id, f.group);
  assert.equal(data.students.find((s) => s.id === f.other)?.group_id, null);
  assert.deepEqual(
    data.myGroups.map((g) => g.id),
    [f.group],
  );
  for (const studentId of [f.owner, f.peer]) {
    await assert.rejects(() =>
      changeClassroomGroups(db, f.classId, f.owner, {
        action: "assign",
        studentId,
        groupId: f.secondGroup,
      }),
    );
  }
  await assert.rejects(() =>
    shareGroupProject(db, f.classId, f.owner, f.project, f.secondGroup),
  );
  const after = (await classroomData(f.classId, f.profile(f.owner), db))!;
  assert.equal(after.students.find((s) => s.id === f.owner)?.group_id, f.group);
  assert.equal(after.students.find((s) => s.id === f.peer)?.group_id, f.group);
  await db.query(
    "delete from class_members where class_id=$1 and child_id=$2",
    [f.classId, f.owner],
  );
  assert.equal(await classroomData(f.classId, f.profile(f.owner), db), null);
});
test("current group members get workspace links and shared project cards; stale membership does not grant access", async () => {
  const f = await fixture();
  const peerProject = (await classroomData(
    f.classId,
    f.profile(f.peer),
    db,
  ))!.projects.find((p) => p.vm_id === f.project)!;
  assert.equal(peerProject.can_collaborate, true);
  assert.equal(peerProject.conversation_id, f.conversation);
  assert.ok(
    (await loadDashboardData(f.profile(f.peer))).projects.some(
      (p) => p.vm_id === f.project,
    ),
  );
  const outsider = (await classroomData(
    f.classId,
    f.profile(f.other),
    db,
  ))!.projects.find((p) => p.vm_id === f.project)!;
  assert.equal(outsider.can_collaborate, false);
  assert.equal(outsider.conversation_id, null);
  await db.query(
    "delete from class_members where class_id=$1 and child_id=$2",
    [f.classId, f.peer],
  );
  assert.equal(await f.access(f.peer), false);
  assert.ok(
    !(await loadDashboardData(f.profile(f.peer))).projects.some(
      (p) => p.vm_id === f.project,
    ),
  );
  assert.equal((await groupNames(db, [f.project])).has(f.project), false);
  assert.equal(
    (
      await setEditor(db, {
        vmId: f.project,
        actorId: f.owner,
        editorId: f.peer,
      })
    ).ok,
    false,
  );
});
test("leaving a named group revokes collaboration even when legacy project-member rows remain", async () => {
  const f = await fixture();
  await db.query(
    "delete from classroom_group_members where group_id=$1 and child_id=$2",
    [f.group, f.owner],
  );
  assert.equal(await f.access(f.peer), false);
  assert.equal((await groupView(db, f.project, f.peer))!.isMember, false);
  assert.equal((await groupView(db, f.project, f.owner))!.editorId, f.owner);
});
test("unrelated group changes preserve the editor and do not block on another group run", async () => {
  const f = await fixture();
  assert.equal(
    (
      await setEditor(db, {
        vmId: f.project,
        actorId: f.owner,
        editorId: f.peer,
      })
    ).ok,
    true,
  );
  const initial = (
    await db.query(
      "select revision from project_execution where project_id=$1",
      [f.project],
    )
  ).rows[0].revision;
  await db.query(
    "update project_execution set active_run=gen_random_uuid() where project_id=$1",
    [f.project],
  );
  await changeClassroomGroups(db, f.classId, f.teacher, {
    action: "assign",
    studentId: f.other,
    groupId: f.secondGroup,
  });
  assert.equal((await groupView(db, f.project, f.owner))!.editorId, f.peer);
  assert.equal(
    (
      await db.query(
        "select revision from project_execution where project_id=$1",
        [f.project],
      )
    ).rows[0].revision,
    initial,
  );
  await assert.rejects(
    changeClassroomGroups(db, f.classId, f.teacher, {
      action: "assign",
      studentId: f.peer,
      groupId: f.secondGroup,
    }),
    /active project requests/,
  );
  assert.equal(await f.access(f.peer), true);
  await db.query(
    "update project_execution set active_run=null where project_id=$1",
    [f.project],
  );
  await changeClassroomGroups(db, f.classId, f.teacher, {
    action: "assign",
    studentId: f.peer,
    groupId: f.secondGroup,
  });
  assert.equal(await f.access(f.peer), false);
  assert.equal((await groupView(db, f.project, f.owner))!.editorId, f.owner);
});
test("a grouped classroom assignment cannot be removed; group removal retains status but revokes sharing", async () => {
  const f = await fixture();
  assert.equal(
    await assignClassroomProject(
      f.classId,
      f.project,
      f.profile(f.owner),
      true,
      db,
    ),
    false,
  );
  assert.equal(
    (
      await setEditor(db, {
        vmId: f.project,
        actorId: f.teacher,
        editorId: f.peer,
      })
    ).ok,
    true,
  );
  await changeClassroomGroups(db, f.classId, f.teacher, {
    action: "delete",
    groupId: f.group,
  });
  const p = (
    await db.query(
      "select group_class_id,classroom_group_id,editor_id,metadata from projects where vm_id=$1",
      [f.project],
    )
  ).rows[0];
  assert.equal(p.group_class_id, f.classId);
  assert.equal(p.classroom_group_id, null);
  assert.equal(p.editor_id, null);
  assert.equal(p.metadata.classroomGroupProject, true);
  assert.equal(await f.access(f.peer), false);
  assert.equal(
    (
      await addMember(db, {
        vmId: f.project,
        actorId: f.teacher,
        childId: f.peer,
      })
    ).ok,
    false,
  );
  assert.equal(
    (
      await db.query(
        "select 1 from classroom_group_members where group_id=$1",
        [f.group],
      )
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await db.query(
        "select 1 from class_projects where class_id=$1 and vm_id=$2",
        [f.classId, f.project],
      )
    ).rowCount,
    1,
  );
});

test("removing a classroom student rolls back while their group project runs and resets control when idle", async () => {
  const f = await fixture();
  await setEditor(db, { vmId: f.project, actorId: f.owner, editorId: f.peer });
  await db.query(
    "update project_execution set active_run=gen_random_uuid() where project_id=$1",
    [f.project],
  );
  const identifier = (
    await db.query("select username from profiles where id=$1", [f.peer])
  ).rows[0].username;
  const remove = () =>
    addDirectoryPerson(db, f.teacher, {
      action: "remove",
      role: "student",
      classId: f.classId,
      identifier,
    });
  await assert.rejects(remove(), /active project requests/);
  assert.equal(await f.access(f.peer), true);
  await db.query(
    "update project_execution set active_run=null where project_id=$1",
    [f.project],
  );
  await remove();
  assert.equal(await f.access(f.peer), false);
  assert.equal((await groupView(db, f.project, f.owner))!.editorId, f.owner);
  assert.equal(
    (
      await db.query(
        "select 1 from project_members where vm_id=$1 and child_id=$2",
        [f.project, f.peer],
      )
    ).rowCount,
    0,
  );
});
