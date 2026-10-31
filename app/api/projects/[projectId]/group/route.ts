import { authorizeProject } from "@/lib/project-access";
import { database } from "@/lib/database";
import { checkOrigin, getProfile, platformEnabled } from "@/lib/platform-auth";
import {
  addMember,
  groupView,
  isMissingGroupSchema,
  removeMember,
  setEditor,
} from "@/lib/project-group";
const valid = (id: unknown): id is string =>
  typeof id === "string" && /^[a-f0-9-]{36}$/i.test(id);
async function actor(projectId: string, mutate: boolean, req?: Request) {
  const user = platformEnabled() ? await getProfile() : null;
  if (!user || (mutate && !checkOrigin(req!))) return null;
  if (!(await authorizeProject(projectId, true))) return null;
  return user;
}
/** Who is in this project's group and who is editing. Anyone who can see the
 * project can read it; the rest of the group list is only for its members. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const user = await actor(projectId, false);
  if (!user)
    return Response.json({ error: "Project not found" }, { status: 404 });
  try {
    const view = await groupView(database(), projectId, user.id);
    if (!view) return Response.json({ visible: false });
    // Students only get the dialog when they own the project or are in its group.
    const visible = user.role === "teacher" ? view.canManage : view.isMember;
    return Response.json({ visible, ...view, you: user.id });
  } catch (error) {
    if (isMissingGroupSchema(error)) return Response.json({ visible: false });
    throw error;
  }
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const user = await actor(projectId, true, req);
  if (!user)
    return Response.json({ error: "Project not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const db = database();
  let result;
  if (body.action === "add" && valid(body.childId))
    result = await addMember(db, {
      vmId: projectId,
      childId: body.childId,
      actorId: user.id,
    });
  else if (body.action === "remove" && valid(body.childId))
    result = await removeMember(db, {
      vmId: projectId,
      childId: body.childId,
      actorId: user.id,
    });
  else if (body.action === "editor" && valid(body.editorId))
    result = await setEditor(db, {
      vmId: projectId,
      editorId: body.editorId,
      actorId: user.id,
    });
  else return Response.json({ error: "Invalid request." }, { status: 400 });
  if (!result.ok)
    return Response.json({ error: result.error }, { status: result.status });
  return Response.json({
    ok: true,
    ...(await groupView(db, projectId, user.id)),
  });
}
