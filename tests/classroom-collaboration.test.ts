// @suite database
import assert from "node:assert/strict";
import { after, test } from "node:test";
import pg from "pg";
import { APPLICATION_DATABASE_OPTIONS } from "../lib/database-options.mjs";
import { classroomData } from "../lib/classroom-data";
import { shareGroupProject } from "../lib/classroom-groups";
import {
  groupView,
  projectGroupMemberSQL,
  setEditor,
} from "../lib/project-group";
const db = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  options: APPLICATION_DATABASE_OPTIONS,
});
after(() => db.end());
const id = (n: number) =>
  `00000000-0000-4000-9000-${String(n).padStart(12, "0")}`;
test("classroom group members can open the shared workspace and leaders retain editor assignment", async () => {
  const [teacher, leader, peer, outsider] = [
    id(901),
    id(902),
    id(903),
    id(904),
  ];
  const school = (
    await db.query(
      "insert into schools(name) values('Collaboration audit') returning id",
    )
  ).rows[0].id;
  for (const [person, name, role] of [
    [teacher, "Audit teacher", "teacher"],
    [leader, "Audit leader", "child"],
    [peer, "Audit peer", "child"],
    [outsider, "Audit outsider", "child"],
  ]) {
    await db.query("insert into auth.users(id) values($1)", [person]);
    await db.query(
      "insert into profiles(id,username,display_name,auth_email,role,school_id) values($1,$2,$3,$4,$5,$6)",
      [
        person,
        name!.replaceAll(" ", "_").toLowerCase(),
        name,
        `${person}@test.invalid`,
        role,
        school,
      ],
    );
  }
  const classroom = (
    await db.query(
      "insert into classes(teacher_id,name,invite_code) values($1,'Audit class','AUDITGRP') returning id",
      [teacher],
    )
  ).rows[0].id;
  for (const child of [leader, peer, outsider])
    await db.query(
      "insert into class_members(class_id,child_id) values($1,$2)",
      [classroom, child],
    );
  const group = (
    await db.query(
      "insert into classroom_groups(class_id,name,category) values($1,'Team audit','animals') returning id",
      [classroom],
    )
  ).rows[0].id;
  for (const child of [leader, peer])
    await db.query(
      "insert into classroom_group_members(class_id,group_id,child_id) values($1,$2,$3)",
      [classroom, group, child],
    );
  const project = "vm-collaborationaudit";
  const conversation = id(905);
  await db.query(
    "insert into projects(vm_id,owner_id,metadata) values($1,$2,$3)",
    [
      project,
      leader,
      { name: "Audit project", conversations: [{ id: conversation }] },
    ],
  );
  await db.query(
    "insert into class_projects(class_id,vm_id,assigned_by) values($1,$2,$3)",
    [classroom, project, leader],
  );
  await shareGroupProject(db, classroom, leader, project, group);
  const profile = (person: string) => ({
    id: person,
    username: "fixture",
    display_name: "Fixture",
    role: "child" as const,
  });
  const peerProject = (await classroomData(
    classroom,
    profile(peer),
    db,
  ))!.projects.find((p) => p.vm_id === project)!;
  assert.equal(peerProject.can_collaborate, true);
  assert.equal(peerProject.conversation_id, conversation);
  const outsiderProject = (await classroomData(
    classroom,
    profile(outsider),
    db,
  ))!.projects.find((p) => p.vm_id === project)!;
  assert.equal(outsiderProject.can_collaborate, false);
  assert.equal(outsiderProject.conversation_id, null);
  assert.equal(
    (await setEditor(db, { vmId: project, actorId: leader, editorId: peer }))
      .ok,
    true,
  );
  assert.equal((await groupView(db, project, leader))!.canPass, true);
  assert.equal(
    (
      await setEditor(db, {
        vmId: project,
        actorId: outsider,
        editorId: outsider,
      })
    ).ok,
    false,
  );
  assert.equal(
    (await setEditor(db, { vmId: project, actorId: leader, editorId: leader }))
      .ok,
    true,
  );
  await db.query(
    "delete from class_members where class_id=$1 and child_id=$2",
    [classroom, peer],
  );
  assert.equal(
    (
      await db.query(
        `select 1 from projects p where p.vm_id=$1 and ${projectGroupMemberSQL("p", "$2")}`,
        [project, peer],
      )
    ).rowCount,
    0,
  );
});
