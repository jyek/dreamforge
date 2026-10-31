import { database } from "@/lib/database";
import { checkOrigin, getProfile, platformEnabled } from "@/lib/platform-auth";
/** A student's own prompts that are waiting for, or have received, a teacher's
 * decision in one conversation. Content is only returned to its author. */
export async function GET(req: Request) {
  const user = platformEnabled() ? await getProfile() : null;
  if (user?.role !== "child")
    return Response.json({ error: "Sign in as a student." }, { status: 403 });
  const conversationId = new URL(req.url).searchParams.get("conversationId");
  if (!conversationId || !/^[a-f0-9-]{36}$/i.test(conversationId))
    return Response.json({ error: "Invalid conversation." }, { status: 400 });
  const { rows } = await database().query(
    `select id,hold_status as status,content from prompt_reviews
     where child_id=$1 and conversation_id=$2 and held_prompt_used_at is null
       and (hold_status in ('pending','approved') or (hold_status='denied' and reviewed_at>now()-interval '10 minutes'))
     order by created_at`,
    [user.id, conversationId],
  );
  return Response.json({ holds: rows });
}
/** The student has seen a teacher's decision; stop reporting it. */
export async function POST(req: Request) {
  const user = platformEnabled() ? await getProfile() : null;
  if (user?.role !== "child" || !checkOrigin(req))
    return Response.json({ error: "Not allowed." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.id !== "string" || !/^[a-f0-9-]{36}$/i.test(body.id))
    return Response.json({ error: "Invalid request." }, { status: 400 });
  const { rowCount } = await database().query(
    "update prompt_reviews set held_prompt_used_at=now() where id=$1 and child_id=$2 and hold_status='denied' and held_prompt_used_at is null",
    [body.id, user.id],
  );
  return Response.json({ ok: !!rowCount });
}
