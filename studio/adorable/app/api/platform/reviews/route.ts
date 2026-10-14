import { database } from "@/lib/database";
import { checkOrigin, getProfile, platformEnabled } from "@/lib/platform-auth";
const scope = `exists(select 1 from adorable.class_members m join adorable.classes c on c.id=m.class_id where m.child_id=r.child_id and c.teacher_id=$1)`;
export async function GET(req: Request) {
  const user = platformEnabled() ? await getProfile() : null;
  if (user?.role !== "teacher")
    return Response.json(
      { error: "Teacher access required." },
      { status: 403 },
    );
  const params = new URL(req.url).searchParams;
  let before: { time: string; id: string } | null = null;
  if (params.get("before")) {
    try {
      before = JSON.parse(
        Buffer.from(params.get("before")!, "base64url").toString("utf8"),
      );
      if (
        !before ||
        !Number.isFinite(Date.parse(before.time)) ||
        !/^[a-f0-9-]{36}$/i.test(before.id)
      )
        throw Error();
    } catch {
      return Response.json({ error: "Invalid review page." }, { status: 400 });
    }
  }
  const { rows } = await database().query(
    `select r.*,p.metadata->>'name' as project_name,pr.display_name as child_name from adorable.prompt_reviews r join adorable.projects p on p.vm_id=r.vm_id join adorable.profiles pr on pr.id=r.child_id where ${scope} and ($2::timestamptz is null or (r.created_at,r.id)<($2::timestamptz,$3::uuid)) and (not $4::boolean or r.decision<>'allow') order by r.created_at desc,r.id desc limit 500`,
    [
      user.id,
      before?.time || null,
      before?.id || null,
      params.get("flags") === "1",
    ],
  );
  const last = rows.at(-1);
  return Response.json({
    reviews: rows,
    nextCursor:
      rows.length === 500
        ? Buffer.from(
            JSON.stringify({ time: last.created_at, id: last.id }),
          ).toString("base64url")
        : null,
  });
}
export async function POST(req: Request) {
  const user = platformEnabled() ? await getProfile() : null;
  if (user?.role !== "teacher" || !checkOrigin(req))
    return Response.json(
      { error: "Teacher access required." },
      { status: 403 },
    );
  const body = await req.json().catch(() => ({}));
  if (typeof body.id !== "string" || !/^[a-f0-9-]{36}$/i.test(body.id))
    return Response.json({ error: "Invalid review." }, { status: 400 });
  const { rowCount } = await database().query(
    `update adorable.prompt_reviews r set reviewed_by=$1,reviewed_at=now() where id=$2 and ${scope}`,
    [user.id, body.id],
  );
  return Response.json({ ok: !!rowCount });
}
