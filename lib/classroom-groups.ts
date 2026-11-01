import type { Pool } from "pg";
import { groupManagerSQL } from "./project-group";
import {
  classroomGroupNames,
  MAX_CLASSROOM_GROUPS,
} from "./classroom-group-names";
export type ClassroomGroupAction = {
  action?: unknown;
  count?: unknown;
  groupId?: unknown;
  studentId?: unknown;
  name?: unknown;
};
export class ClassroomGroupError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const uuid = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9-]{36}$/i.test(value);
export async function changeClassroomGroups(
  db: Pool,
  classId: string,
  actorId: string,
  body: ClassroomGroupAction,
) {
  const tx = await db.connect();
  try {
    await tx.query("begin");
    // Serialize count/name/membership changes for this classroom and recheck teaching authority.
    const authorized = await tx.query(
      `select c.id from classes c where c.id=$1 and ${groupManagerSQL("c.id", "$2")} for update`,
      [classId, actorId],
    );
    if (!authorized.rowCount)
      throw new ClassroomGroupError(404, "Classroom not found.");
    if (body.action === "create") {
      const existing = await tx.query(
        "select name from classroom_groups where class_id=$1",
        [classId],
      );
      if (
        typeof body.count !== "number" ||
        !Number.isInteger(body.count) ||
        body.count < 1 ||
        existing.rowCount! + body.count > MAX_CLASSROOM_GROUPS
      )
        throw new ClassroomGroupError(
          400,
          `A classroom can have up to ${MAX_CLASSROOM_GROUPS} groups. You can create up to ${Math.max(0, MAX_CLASSROOM_GROUPS - (existing.rowCount || 0))} more groups.`,
        );
      const customName = typeof body.name === "string" ? body.name.trim() : "";
      if (
        body.name !== undefined &&
        (body.count !== 1 || !customName || customName.length > 60)
      )
        throw new ClassroomGroupError(
          400,
          "Use a group name between 1 and 60 characters.",
        );
      if (
        customName &&
        existing.rows.some(
          (r) => r.name.toLowerCase() === customName.toLowerCase(),
        )
      )
        throw new ClassroomGroupError(
          409,
          "That group name is already in use.",
        );
      const batch = classroomGroupNames(
        body.count,
        existing.rows.map((r) => r.name),
      );
      for (const name of customName ? [customName] : batch.names)
        await tx.query(
          "insert into classroom_groups(class_id,name,category) values($1,$2,$3)",
          [classId, name, batch.category],
        );
    } else if (body.action === "assign") {
      if (
        !uuid(body.studentId) ||
        (body.groupId !== null && !uuid(body.groupId))
      )
        throw new ClassroomGroupError(400, "Choose a student and group.");
      const member = await tx.query(
        "select 1 from class_members m join profiles p on p.id=m.child_id where m.class_id=$1 and m.child_id=$2 and p.role='child' for update of m",
        [classId, body.studentId],
      );
      if (!member.rowCount)
        throw new ClassroomGroupError(
          400,
          "Choose a student in this classroom.",
        );
      if (body.groupId === null)
        await tx.query(
          "delete from classroom_group_members where class_id=$1 and child_id=$2",
          [classId, body.studentId],
        );
      else {
        const group = await tx.query(
          "select 1 from classroom_groups where class_id=$1 and id=$2",
          [classId, body.groupId],
        );
        if (!group.rowCount)
          throw new ClassroomGroupError(404, "Group not found.");
        await tx.query(
          "insert into classroom_group_members(class_id,child_id,group_id) values($1,$2,$3) on conflict(class_id,child_id) do update set group_id=excluded.group_id",
          [classId, body.studentId, body.groupId],
        );
      }
    } else if (body.action === "rename" || body.action === "delete") {
      if (!uuid(body.groupId))
        throw new ClassroomGroupError(400, "Choose a group.");
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (body.action === "rename" && (!name || name.length > 60))
        throw new ClassroomGroupError(
          400,
          "Use a group name between 1 and 60 characters.",
        );
      if (body.action === "delete") {
        const projects = await tx.query(
          "select vm_id from projects where classroom_group_id=$1 and group_class_id=$2 order by vm_id for update",
          [body.groupId, classId],
        );
        for (const p of projects.rows) {
          await tx.query(
            "insert into project_execution(project_id) values($1) on conflict do nothing",
            [p.vm_id],
          );
          const run = await tx.query(
            "select active_run from project_execution where project_id=$1 for update",
            [p.vm_id],
          );
          if (run.rows[0].active_run)
            throw new ClassroomGroupError(
              409,
              "Wait for active project requests to finish before removing this group.",
            );
          await tx.query("delete from project_members where vm_id=$1", [
            p.vm_id,
          ]);
          await tx.query(
            "update projects set classroom_group_id=null,editor_id=null,metadata=jsonb_set(metadata,'{classroomGroupProject}','true'::jsonb) where vm_id=$1",
            [p.vm_id],
          );
          await tx.query(
            "update project_execution set revision=revision+1,verification=null where project_id=$1",
            [p.vm_id],
          );
        }
      }
      const result =
        body.action === "delete"
          ? await tx.query(
              "delete from classroom_groups where class_id=$1 and id=$2",
              [classId, body.groupId],
            )
          : await tx.query(
              "update classroom_groups set name=$3 where class_id=$1 and id=$2",
              [classId, body.groupId, name],
            );
      if (!result.rowCount)
        throw new ClassroomGroupError(404, "Group not found.");
    } else throw new ClassroomGroupError(400, "Unknown group action.");
    if (body.action === "assign") await syncClassroomGroupProjects(tx, classId);
    await tx.query("commit");
  } catch (error) {
    await tx.query("rollback");
    if ((error as { code?: string }).code === "23505")
      throw new ClassroomGroupError(409, "That group name is already in use.");
    throw error;
  } finally {
    tx.release();
  }
}

export async function syncClassroomGroupProjects(
  tx: import("pg").PoolClient,
  classId: string,
) {
  const projects = await tx.query(
    "select vm_id,owner_id,editor_id,group_class_id,classroom_group_id from projects where classroom_group_id in(select id from classroom_groups where class_id=$1) order by vm_id for update",
    [classId],
  );
  for (const p of projects.rows) {
    const desired = (
      await tx.query(
        "select m.child_id from classroom_group_members m join classroom_group_members owner on owner.group_id=m.group_id and owner.child_id=$2 where m.group_id=$1 and m.child_id<>$2 order by m.child_id",
        [p.classroom_group_id, p.owner_id],
      )
    ).rows.map((r) => r.child_id as string);
    const previous = (
      await tx.query(
        "select child_id from project_members where vm_id=$1 order by child_id",
        [p.vm_id],
      )
    ).rows.map((r) => r.child_id as string);
    const nextEditor =
      p.editor_id && desired.includes(p.editor_id) ? p.editor_id : null;
    if (
      p.group_class_id === classId &&
      nextEditor === p.editor_id &&
      desired.join(",") === previous.join(",")
    )
      continue;
    await tx.query(
      "insert into project_execution(project_id) values($1) on conflict do nothing",
      [p.vm_id],
    );
    const run = await tx.query(
      "select active_run from project_execution where project_id=$1 for update",
      [p.vm_id],
    );
    if (run.rows[0].active_run)
      throw new ClassroomGroupError(
        409,
        "Wait for active project requests to finish before changing group membership.",
      );
    await tx.query("delete from project_members where vm_id=$1", [p.vm_id]);
    await tx.query(
      "insert into project_members(vm_id,child_id,added_by) select $1,m.child_id,$2 from classroom_group_members m join classroom_group_members owner on owner.group_id=m.group_id and owner.child_id=$2 where m.group_id=$3 and m.child_id<>$2",
      [p.vm_id, p.owner_id, p.classroom_group_id],
    );
    await tx.query(
      "update projects set editor_id=$3,group_class_id=$2 where vm_id=$1",
      [p.vm_id, classId, nextEditor],
    );
    await tx.query(
      "update project_execution set revision=revision+1,verification=null where project_id=$1",
      [p.vm_id],
    );
  }
}
export async function shareGroupProject(
  db: Pool,
  classId: string,
  actorId: string,
  projectId: string,
  groupId: string,
) {
  const tx = await db.connect();
  try {
    await tx.query("begin");
    await tx.query("select id from classes where id=$1 for update", [classId]);
    const eligible = await tx.query(
      `select p.vm_id from projects p join class_projects cp on cp.vm_id=p.vm_id and cp.class_id=$1 join classroom_group_members m on m.class_id=$1 and m.child_id=p.owner_id where p.vm_id=$2 and p.owner_id=$3 and m.group_id=$4 and not p.is_example for update of p`,
      [classId, projectId, actorId, groupId],
    );
    if (!eligible.rowCount)
      throw new ClassroomGroupError(
        403,
        "Choose your own classroom project and a group you belong to.",
      );
    await tx.query(
      "update projects set classroom_group_id=$2,metadata=jsonb_set(metadata,'{classroomGroupProject}','true'::jsonb) where vm_id=$1",
      [projectId, groupId],
    );
    await syncClassroomGroupProjects(tx, classId);
    await tx.query("commit");
  } catch (e) {
    await tx.query("rollback");
    throw e;
  } finally {
    tx.release();
  }
}
