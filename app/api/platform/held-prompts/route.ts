import { database } from "@/lib/database";
import { checkOrigin, getProfile, platformEnabled } from "@/lib/platform-auth";
import {
  requestPromptApproval,
  studentPromptApprovals,
} from "@/lib/prompt-hold";
/** A student's own prompts that are waiting for, or have received, a teacher's
 * decision in one conversation. Content is only returned to its author. */
export async function GET(req: Request) {
  const user = platformEnabled() ? await getProfile() : null;
  if (user?.role !== "child")
    return Response.json({ error: "Sign in as a student." }, { status: 403 });
  const params = new URL(req.url).searchParams;
  const conversationId = params.get("conversationId");
  const projectId = params.get("projectId");
  if (!projectId || !/^vm-[a-z0-9]+$/.test(projectId))
    return Response.json({ error: "Invalid project." }, { status: 400 });
  if (!conversationId || !/^[a-f0-9-]{36}$/i.test(conversationId))
    return Response.json({ error: "Invalid conversation." }, { status: 400 });
  const prompts = await studentPromptApprovals(database(), {
    childId: user.id,
    projectId,
    conversationId,
  });
  const holds = prompts.filter(
    (p) =>
      p.eligible &&
      !p.used &&
      (p.status === "pending" ||
        (p.status === "approved" && p.can_resume) ||
        (p.status === "denied" &&
          Date.parse(p.reviewed_at) > Date.now() - 10 * 60 * 1000)),
  );
  return Response.json({ holds, prompts });
}
/** The student has seen a teacher's decision; stop reporting it. */
export async function POST(req: Request) {
  const user = platformEnabled() ? await getProfile() : null;
  if (user?.role !== "child" || !checkOrigin(req))
    return Response.json({ error: "Not allowed." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.id !== "string" || !/^[a-f0-9-]{36}$/i.test(body.id))
    return Response.json({ error: "Invalid request." }, { status: 400 });
  if (body.action === "request") {
    if (
      typeof body.projectId !== "string" ||
      !/^vm-[a-z0-9]+$/.test(body.projectId) ||
      typeof body.conversationId !== "string" ||
      !/^[a-f0-9-]{36}$/i.test(body.conversationId)
    )
      return Response.json(
        { error: "Invalid project or conversation." },
        { status: 400 },
      );
    const requested = await requestPromptApproval(database(), {
      id: body.id,
      childId: user.id,
      projectId: body.projectId,
      conversationId: body.conversationId,
    });
    if (!requested)
      return Response.json(
        {
          error:
            "This prompt cannot be requested again, or you no longer have a classroom or project access.",
        },
        { status: 409 },
      );
    return Response.json({ ok: true, ...requested });
  }
  const { rowCount } = await database().query(
    "update prompt_reviews set held_prompt_used_at=now() where id=$1 and child_id=$2 and hold_status='denied' and held_prompt_used_at is null",
    [body.id, user.id],
  );
  return Response.json({ ok: !!rowCount });
}
