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
    "select id,username,display_name,role from adorable.profiles where id=$1",
    [session.id],
  );
  return rows[0] || null;
});
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const inviteToken = () => randomBytes(24).toString("base64url");
export async function canReadChild(teacherId: string, childId: string) {
  const { rowCount } = await database().query(
    "select 1 from adorable.teacher_builders where teacher_id=$1 and child_id=$2",
    [teacherId, childId],
  );
  return !!rowCount;
}
export async function platformProjectAccess(
  projectId: string,
  readOnly = false,
) {
  const profile = await getProfile();
  const { rows } = await database().query(
    `select metadata,owner_id,is_example from adorable.projects where vm_id=$1`,
    [projectId],
  );
  const row = rows[0];
  if (!row) return null;
  if (readOnly && row.is_example) return row.metadata;
  if (!profile || row.is_example) return null;
  if (row.owner_id === profile.id) return row.metadata;
  if (readOnly && profile.role === "child") {
    const { rowCount } = await database().query(
      `select 1 from adorable.class_projects pc join adorable.classes c on c.id=pc.class_id join adorable.class_members m on m.class_id=c.id where pc.vm_id=$1 and m.child_id=$2 and c.teacher_id=$3`,
      [projectId, profile.id, row.owner_id],
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
    `insert into adorable.auth_attempts(bucket,expires_at) values($1,now()+interval '10 minutes') on conflict(bucket) do update set attempts=adorable.auth_attempts.attempts+1 returning attempts`,
    [bucket],
  );
  return rows[0].attempts <= 20;
}
