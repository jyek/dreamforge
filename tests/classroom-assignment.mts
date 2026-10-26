import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { database } from "../lib/database";
import { assignClassroomProject, classroomData } from "../lib/classroom-data";
const db = database(),
  client = await db.connect();
try {
  await client.query("begin");
  const { rows } = await client.query(
    `select c.id as class_id,c.teacher_id,p.vm_id,pr.id,pr.username,pr.display_name,pr.role from classes c join class_members m on m.class_id=c.id join profiles pr on pr.id=m.child_id join projects p on p.owner_id=pr.id where not p.is_example limit 1`,
  );
  assert.ok(
    rows.length,
    "Need one existing classroom student project for this transaction-only test.",
  );
  const row = rows[0],
    user = {
      id: row.id,
      username: row.username,
      display_name: row.display_name,
      role: row.role,
    };
  assert.ok(
    await assignClassroomProject(row.class_id, row.vm_id, user, false, client),
  );
  assert.ok(
    await assignClassroomProject(row.class_id, row.vm_id, user, false, client),
  );
  const student = await classroomData(row.class_id, user, client);
  assert.ok(student?.projects.some((p) => p.vm_id === row.vm_id));
  assert.ok(
    student?.availableProjects.some((p) => p.vm_id === row.vm_id && p.assigned),
  );
  const outsider = { ...user, id: randomUUID() };
  assert.equal(await classroomData(row.class_id, outsider, client), null);
  assert.equal(
    await assignClassroomProject(
      row.class_id,
      row.vm_id,
      outsider,
      false,
      client,
    ),
    false,
  );
  const teacher = { ...user, id: row.teacher_id, role: "teacher" as const };
  assert.equal(
    await assignClassroomProject(
      row.class_id,
      row.vm_id,
      teacher,
      false,
      client,
    ),
    false,
  );
  assert.ok(
    (await classroomData(row.class_id, teacher, client))?.projects.some(
      (p) => p.vm_id === row.vm_id,
    ),
  );
  assert.ok(
    await assignClassroomProject(row.class_id, row.vm_id, user, true, client),
  );
  assert.ok(
    !(await classroomData(row.class_id, user, client))?.projects.some(
      (p) => p.vm_id === row.vm_id,
    ),
  );
  console.log(
    "Passed assignment, idempotency, teacher/student views, owner-only writes, outsider denial and removal. All changes rolled back.",
  );
} finally {
  await client.query("rollback");
  client.release();
  await db.end();
}
