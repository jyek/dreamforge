import { classroomTeacherSQL } from "./classroom-permissions";
type Db = {
  query: (
    sql: string,
    params: unknown[],
  ) => Promise<{ rows: any[]; rowCount: number | null }>;
};
type TransactionPool = Db & {
  connect: () => Promise<Db & { release: () => void }>;
};
export const MAX_GROUP_SIZE = 8;
/** Postgres "column/table does not exist": the group migration is not applied yet. */
export const isMissingGroupSchema = (error: unknown) =>
  ["42703", "42P01"].includes((error as { code?: string })?.code || "");
export type GroupResult =
  | { ok: true }
  | { ok: false; status: number; error: string };
const fail = (status: number, error: string): GroupResult => ({
  ok: false,
  status,
  error,
});
/** Who may edit a project: the chosen editor, otherwise its owner. */
export const effectiveEditor = (row: {
  owner_id: string | null;
  editor_id: string | null;
}) => row.editor_id ?? row.owner_id;
/** What a student may do with a project: "edit" for the one student holding the
 * pen (the chosen editor, otherwise the owner); "view" for the owner and every
 * group member; otherwise nothing. */
export function projectAccessLevel(input: {
  ownerId: string | null;
  editorId: string | null;
  isMember: boolean;
  userId: string;
}): "edit" | "view" | null {
  if ((input.editorId ?? input.ownerId) === input.userId) return "edit";
  if (input.ownerId === input.userId || input.isMember) return "view";
  return null;
}
export async function loadGroup(db: Db, vmId: string) {
  const project = (
    await db.query(
      "select p.owner_id,p.editor_id,p.group_class_id,o.display_name as owner_name from projects p left join profiles o on o.id=p.owner_id where p.vm_id=$1 and not p.is_example and o.role='child'",
      [vmId],
    )
  ).rows[0];
  if (!project?.owner_id) return null;
  const members = (
    await db.query(
      "select pr.id,pr.display_name,pr.username from project_members m join profiles pr on pr.id=m.child_id join projects p on p.vm_id=m.vm_id join profiles owner on owner.id=p.owner_id where m.vm_id=$1 and pr.school_id is not distinct from owner.school_id and exists(select 1 from class_members cm where cm.class_id=p.group_class_id and cm.child_id=pr.id) order by lower(pr.display_name)",
      [vmId],
    )
  ).rows;
  return {
    classId: project.group_class_id as string | null,
    ownerId: project.owner_id as string,
    ownerName: project.owner_name as string,
    editorId: (members.some((m) => m.id === project.editor_id)
      ? project.editor_id
      : project.owner_id) as string,
    members: members as {
      id: string;
      display_name: string;
      username: string;
    }[],
  };
}
/** Explicit classroom teachers and that school's administrators may manage groups. */
export const groupManagerSQL = (classId: string, actorId: string) =>
  `(${classroomTeacherSQL(classId, actorId)} or exists(select 1 from classes gc join profiles gt on gt.id=gc.teacher_id join school_admins ga on ga.school_id=gt.school_id where gc.id=${classId} and ga.profile_id=${actorId}))`;
async function canManage(
  db: Db,
  vmId: string,
  actorId: string,
  ownerId: string,
) {
  const { rowCount } = await db.query(
    `select 1 from projects p join class_members m on m.child_id=p.owner_id
    join classes c on c.id=m.class_id join profiles owner on owner.id=p.owner_id join profiles teacher on teacher.id=c.teacher_id
    where p.vm_id=$1 and p.owner_id=$2 and (p.group_class_id is null or p.group_class_id=c.id)
    and owner.school_id is not distinct from teacher.school_id and ${groupManagerSQL("c.id", "$3")}`,
    [vmId, ownerId, actorId],
  );
  return !!rowCount;
}
/** Candidates must share the group's classroom, which the actor manages. */
export async function classmatesFor(
  db: Db,
  ownerId: string,
  vmId: string,
  actorId: string,
) {
  const { rows } = await db.query(
    `select distinct pr.id,pr.display_name,pr.username from profiles pr
    join class_members other on other.child_id=pr.id join class_members mine on mine.class_id=other.class_id
    join classes c on c.id=mine.class_id join profiles teacher on teacher.id=c.teacher_id
    join projects p on p.vm_id=$2 join profiles owner on owner.id=p.owner_id
    where mine.child_id=$1 and pr.id<>$1 and pr.role='child'
    and pr.school_id is not distinct from owner.school_id and owner.school_id is not distinct from teacher.school_id
    and (p.group_class_id is null or p.group_class_id=c.id) and ${groupManagerSQL("c.id", "$3")}
    and not exists(select 1 from project_members m where m.vm_id=$2 and m.child_id=pr.id)
    order by pr.display_name`,
    [ownerId, vmId, actorId],
  );
  return rows as { id: string; display_name: string; username: string }[];
}
/** Serialize membership/editor changes, including the busy check, on one connection. */
async function mutate(
  db: TransactionPool,
  vmId: string,
  run: (db: Db) => Promise<GroupResult>,
): Promise<GroupResult> {
  if (!db.connect)
    throw Error("Group mutations require a transaction-capable database.");
  const tx = await db.connect();
  try {
    await tx.query("begin", []);
    await tx.query("select vm_id from projects where vm_id=$1 for update", [
      vmId,
    ]);
    await tx.query(
      "insert into project_execution(project_id) select vm_id from projects where vm_id=$1 on conflict do nothing",
      [vmId],
    );
    await tx.query(
      "select project_id from project_execution where project_id=$1 for update",
      [vmId],
    );
    const result = await run(tx);
    await tx.query(result.ok ? "commit" : "rollback", []);
    return result;
  } catch (error) {
    await tx.query("rollback", []);
    throw error;
  } finally {
    tx.release();
  }
}
export async function groupView(db: Db, vmId: string, actorId: string) {
  const group = await loadGroup(db, vmId);
  if (!group) return null;
  const manage = await canManage(db, vmId, actorId, group.ownerId);
  const member =
    actorId === group.ownerId || group.members.some((m) => m.id === actorId);
  return {
    ...group,
    canManage: manage,
    // Whoever holds the pen, or whoever manages the group, can pass it on.
    canPass: manage || actorId === group.editorId,
    isMember: member,
    candidates: manage
      ? await classmatesFor(db, group.ownerId, vmId, actorId)
      : [],
  };
}
export async function addMember(
  db: TransactionPool,
  input: { vmId: string; childId: string; actorId: string; classId?: string },
): Promise<GroupResult> {
  return mutate(db, input.vmId, async (db) => {
    const group = await loadGroup(db, input.vmId);
    if (!group) return fail(404, "Project not found.");
    if (!(await canManage(db, input.vmId, input.actorId, group.ownerId)))
      return fail(
        403,
        "Only a classroom teacher or school administrator can change the group.",
      );
    if (input.childId === group.ownerId)
      return fail(400, "The owner is already in the group.");
    if (group.members.length + 1 >= MAX_GROUP_SIZE)
      return fail(400, `A group can have up to ${MAX_GROUP_SIZE} students.`);
    // Only classmates of the owner can join, so a group never crosses classes or schools.
    const classmates = await classmatesFor(
      db,
      group.ownerId,
      input.vmId,
      input.actorId,
    );
    if (!classmates.some((c) => c.id === input.childId))
      return fail(400, "Only classmates can join this group.");
    // Fix one classroom when the first member is added. Later additions use that scope.
    const scope = await db.query(
      `select c.id from classes c join class_members owner on owner.class_id=c.id join class_members member on member.class_id=c.id
    where owner.child_id=$1 and member.child_id=$2 and ($3::uuid is null or c.id=$3) and ($4::uuid is null or c.id=$4)
    and ${groupManagerSQL("c.id", "$5")} order by c.id limit 1`,
      [
        group.ownerId,
        input.childId,
        group.classId,
        input.classId || null,
        input.actorId,
      ],
    );
    if (!scope.rows[0])
      return fail(400, "Choose students in the same managed classroom.");
    if (await busy(db, input.vmId))
      return fail(409, "Wait for the current request to finish first.");
    await db.query("update projects set group_class_id=$2 where vm_id=$1", [
      input.vmId,
      scope.rows[0].id,
    ]);
    await db.query(
      "insert into project_members(vm_id,child_id,added_by) values($1,$2,$3) on conflict do nothing",
      [input.vmId, input.childId, input.actorId],
    );
    return { ok: true };
  });
}
async function busy(db: Db, vmId: string) {
  const { rows } = await db.query(
    "select active_run is not null as busy from project_execution where project_id=$1",
    [vmId],
  );
  return rows[0]?.busy === true;
}
export async function removeMember(
  db: TransactionPool,
  input: { vmId: string; childId: string; actorId: string },
): Promise<GroupResult> {
  return mutate(db, input.vmId, async (db) => {
    const group = await loadGroup(db, input.vmId);
    if (!group) return fail(404, "Project not found.");
    const self = input.actorId === input.childId;
    if (
      !self &&
      !(await canManage(db, input.vmId, input.actorId, group.ownerId))
    )
      return fail(
        403,
        "Only a classroom teacher or school administrator can change the group.",
      );
    if (await busy(db, input.vmId))
      return fail(409, "Wait for the current request to finish first.");
    await db.query(
      "delete from project_members where vm_id=$1 and child_id=$2",
      [input.vmId, input.childId],
    );
    // A removed editor hands the project back to its owner.
    await db.query(
      "update projects set editor_id=null where vm_id=$1 and editor_id=$2",
      [input.vmId, input.childId],
    );
    // Invalidate requests authorized before this membership change.
    await db.query(
      "update project_execution set revision=revision+1,verification=null where project_id=$1",
      [input.vmId],
    );
    return { ok: true };
  });
}
/** Pass the pen: exactly one student can edit at a time. */
export async function setEditor(
  db: TransactionPool,
  input: { vmId: string; editorId: string; actorId: string },
): Promise<GroupResult> {
  return mutate(db, input.vmId, async (db) => {
    const group = await loadGroup(db, input.vmId);
    if (!group) return fail(404, "Project not found.");
    const allowed =
      input.actorId === group.editorId ||
      (await canManage(db, input.vmId, input.actorId, group.ownerId));
    if (!allowed)
      return fail(
        403,
        "Only the current editor, a classroom teacher or a school administrator can do this.",
      );
    const inGroup =
      input.editorId === group.ownerId ||
      group.members.some((m) => m.id === input.editorId);
    if (!inGroup) return fail(400, "Choose someone in this group.");
    if (await busy(db, input.vmId))
      return fail(
        409,
        "Wait for the current request to finish before passing the pen.",
      );
    await db.query("update projects set editor_id=$2 where vm_id=$1", [
      input.vmId,
      input.editorId === group.ownerId ? null : input.editorId,
    ]);
    // beginRun checks this revision under the same execution lock. A request
    // authorized before handover cannot start afterward with stale permissions.
    await db.query(
      "update project_execution set revision=revision+1,verification=null where project_id=$1",
      [input.vmId],
    );
    return { ok: true };
  });
}
/** Names of the students in each project's group (empty for individual projects).
 * Returns nothing until the group migration has been applied. */
export async function groupNames(db: Db, vmIds: string[]) {
  const names = new Map<string, string[]>();
  if (!vmIds.length) return names;
  try {
    const { rows } = await db.query(
      `select m.vm_id,array_agg(pr.display_name order by lower(pr.display_name)) as names
       from project_members m join profiles pr on pr.id=m.child_id
       where m.vm_id=any($1::text[]) group by m.vm_id`,
      [vmIds],
    );
    for (const row of rows) names.set(row.vm_id, row.names);
  } catch (error) {
    if (!isMissingGroupSchema(error)) throw error;
  }
  return names;
}
