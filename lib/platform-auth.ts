import { safetyEnabled } from "./safety-mode";
import { isMissingGroupSchema, projectAccessLevel } from "./project-group";
import {
  classroomTeacherSQL,
  sharedTeachingProjectSQL,
  teacherStudentAccessSQL,
} from "./classroom-permissions";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { database } from "./database";
import { getStudentSession } from "./student-session";
export const platformEnabled = () =>
  process.env.DREAMFORGE_AUTH_ENABLED === "true";
export type Profile = {
  id: string;
  username: string;
  display_name: string;
  role: "teacher" | "child";
};
export const getProfile = cache(async (): Promise<Profile | null> => {
  const session = await getStudentSession();
  if (!session) return null;
  const { rows } = await database().query(
    "select id,username,display_name,role from profiles where id=$1",
    [session.id],
  );
  return rows[0] || null;
});
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const inviteToken = () => randomBytes(24).toString("base64url");
export async function canReadChild(teacherId: string, childId: string) {
  const { rowCount } = await database().query(
    `select 1 where ${teacherStudentAccessSQL("$2")}`,
    [teacherId, childId],
  );
  return !!rowCount;
}
export async function platformProjectAccess(
  projectId: string,
  readOnly = false,
) {
  const profile = await getProfile();
  // Until the group-projects migration is applied, projects have no editor.
  const { rows } = await database()
    .query(
      `select metadata,owner_id,editor_id,is_example from projects where vm_id=$1`,
      [projectId],
    )
    .catch(async (error) => {
      if (!isMissingGroupSchema(error)) throw error;
      return database().query(
        `select metadata,owner_id,null::uuid as editor_id,is_example from projects where vm_id=$1`,
        [projectId],
      );
    });
  const row = rows[0];
  if (!row) return null;
  if (readOnly && row.is_example)
    return !safetyEnabled() || profile ? row.metadata : null;
  if (!profile || row.is_example) return null;
  // One student edits at a time; the owner and every group member can view.
  const isMember =
    profile.role === "child" && row.owner_id !== profile.id
      ? !!(
          await database()
            .query(
              "select 1 from project_members where vm_id=$1 and child_id=$2",
              [projectId, profile.id],
            )
            .catch((error) => {
              if (!isMissingGroupSchema(error)) throw error;
              return { rowCount: 0 };
            })
        ).rowCount
      : false;
  const level = projectAccessLevel({
    ownerId: row.owner_id,
    editorId: row.editor_id,
    isMember,
    userId: profile.id,
  });
  if (level === "edit" || (readOnly && level === "view")) return row.metadata;
  if (readOnly && profile.role === "child") {
    const { rowCount } = await database().query(
      `select 1 from class_projects pc join classes c on c.id=pc.class_id join class_members m on m.class_id=c.id where pc.vm_id=$1 and m.child_id=$2 and ${classroomTeacherSQL("c.id", "$3")}`,
      [projectId, profile.id, row.owner_id],
    );
    if (rowCount) return row.metadata;
  }
  if (readOnly && profile.role === "teacher") {
    const { rowCount } = await database().query(
      `select 1 where ${sharedTeachingProjectSQL("$1", "$2", "$3")}`,
      [projectId, row.owner_id, profile.id],
    );
    if (rowCount) return row.metadata;
  }
  if (
    readOnly &&
    profile.role === "teacher" &&
    (await canReadChild(profile.id, row.owner_id))
  )
    return row.metadata;
  return null;
}
export function checkOrigin(req: Request) {
  const origin = req.headers.get("origin");
  return (
    !origin ||
    origin === new URL(req.url).origin ||
    origin === process.env.DREAMFORGE_SITE_URL
  );
}
export async function limitAuth(req: Request) {
  const ip =
    req.headers.get("x-vercel-forwarded-for") ||
    req.headers.get("x-forwarded-for") ||
    "local";
  const bucket = tokenHash(
    ip.split(",")[0] + ":" + Math.floor(Date.now() / 600000),
  );
  const { rows } = await database().query(
    `insert into auth_attempts(bucket,expires_at) values($1,now()+interval '10 minutes') on conflict(bucket) do update set attempts=auth_attempts.attempts+1 returning attempts`,
    [bucket],
  );
  return rows[0].attempts <= 20;
}
