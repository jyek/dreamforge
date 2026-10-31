import { teacherStudentAccessSQL } from "./classroom-permissions";
type Db = {
  query: (
    sql: string,
    params: unknown[],
  ) => Promise<{ rows: any[]; rowCount: number | null }>;
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
      "select p.owner_id,p.editor_id,o.display_name as owner_name from projects p left join profiles o on o.id=p.owner_id where p.vm_id=$1 and not p.is_example",
      [vmId],
    )
  ).rows[0];
  if (!project?.owner_id) return null;
  const members = (
    await db.query(
      "select pr.id,pr.display_name,pr.username from project_members m join profiles pr on pr.id=m.child_id where m.vm_id=$1 order by lower(pr.display_name)",
      [vmId],
    )
  ).rows;
  return {
    ownerId: project.owner_id as string,
    ownerName: project.owner_name as string,
    editorId: effectiveEditor(project) as string,
    members: members as {
      id: string;
      display_name: string;
      username: string;
    }[],
  };
}
/** The owner, or a teacher of the owner, manages who is in the group. */
async function canManage(
  db: Db,
  vmId: string,
  actorId: string,
  ownerId: string,
) {
  if (actorId === ownerId) return true;
  const { rowCount } = await db.query(
    `select 1 from profiles t where t.id=$1 and t.role='teacher' and ${teacherStudentAccessSQL("$2")}`,
    [actorId, ownerId],
  );
  return !!rowCount;
}
/** Students in a class with the owner who could join the group. */
export async function classmatesFor(db: Db, ownerId: string, vmId: string) {
  const { rows } = await db.query(
    `select distinct pr.id,pr.display_name,pr.username from class_members mine
     join class_members other on other.class_id=mine.class_id
     join profiles pr on pr.id=other.child_id
     where mine.child_id=$1 and pr.id<>$1 and pr.role='child'
       and not exists(select 1 from project_members m where m.vm_id=$2 and m.child_id=pr.id)
     order by lower(pr.display_name)`,
    [ownerId, vmId],
  );
  return rows as { id: string; display_name: string; username: string }[];
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
    candidates: manage ? await classmatesFor(db, group.ownerId, vmId) : [],
  };
}
export async function addMember(
  db: Db,
  input: { vmId: string; childId: string; actorId: string },
): Promise<GroupResult> {
  const group = await loadGroup(db, input.vmId);
  if (!group) return fail(404, "Project not found.");
  if (!(await canManage(db, input.vmId, input.actorId, group.ownerId)))
    return fail(
      403,
      "Only the project owner or a teacher can change the group.",
    );
  if (input.childId === group.ownerId)
    return fail(400, "The owner is already in the group.");
  if (group.members.length + 1 >= MAX_GROUP_SIZE)
    return fail(400, `A group can have up to ${MAX_GROUP_SIZE} students.`);
  // Only classmates of the owner can join, so a group never crosses classes or schools.
  const classmates = await classmatesFor(db, group.ownerId, input.vmId);
  if (!classmates.some((c) => c.id === input.childId))
    return fail(400, "Only classmates can join this group.");
  await db.query(
    "insert into project_members(vm_id,child_id,added_by) values($1,$2,$3) on conflict do nothing",
    [input.vmId, input.childId, input.actorId],
  );
  return { ok: true };
}
async function busy(db: Db, vmId: string) {
  const { rows } = await db.query(
    "select active_run is not null as busy from project_execution where project_id=$1",
    [vmId],
  );
  return rows[0]?.busy === true;
}
export async function removeMember(
  db: Db,
  input: { vmId: string; childId: string; actorId: string },
): Promise<GroupResult> {
  const group = await loadGroup(db, input.vmId);
  if (!group) return fail(404, "Project not found.");
  const self = input.actorId === input.childId;
  if (!self && !(await canManage(db, input.vmId, input.actorId, group.ownerId)))
    return fail(
      403,
      "Only the project owner or a teacher can change the group.",
    );
  if (group.editorId === input.childId && (await busy(db, input.vmId)))
    return fail(409, "Wait for the current request to finish first.");
  await db.query("delete from project_members where vm_id=$1 and child_id=$2", [
    input.vmId,
    input.childId,
  ]);
  // A removed editor hands the project back to its owner.
  await db.query(
    "update projects set editor_id=null where vm_id=$1 and editor_id=$2",
    [input.vmId, input.childId],
  );
  return { ok: true };
}
/** Pass the pen: exactly one student can edit at a time. */
export async function setEditor(
  db: Db,
  input: { vmId: string; editorId: string; actorId: string },
): Promise<GroupResult> {
  const group = await loadGroup(db, input.vmId);
  if (!group) return fail(404, "Project not found.");
  const allowed =
    input.actorId === group.editorId ||
    (await canManage(db, input.vmId, input.actorId, group.ownerId));
  if (!allowed)
    return fail(
      403,
      "Only the student who is editing, the owner or a teacher can do this.",
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
  return { ok: true };
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
