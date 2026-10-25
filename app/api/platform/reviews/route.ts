import { teacherStudentAccessSQL } from "@/lib/classroom-permissions";
import { database } from "@/lib/database";
import { checkOrigin, getProfile, platformEnabled } from "@/lib/platform-auth";
const scope = `${teacherStudentAccessSQL("r.child_id")}`;
export async function GET(req: Request) {
  const user = platformEnabled() ? await getProfile() : null;
  if (user?.role !== "teacher")
    return Response.json(
      { error: "Teacher access required." },
      { status: 403 },
    );
  const params = new URL(req.url).searchParams;
  if (params.get("group") === "projects") {
    const { rows } = await database().query(
      `select p.vm_id,p.metadata->>'name' as project_name,pr.display_name as child_name,
      count(r.id)::int as prompt_count,count(r.id) filter(where r.decision<>'allow')::int as flagged_count,
      count(r.id) filter(where r.decision<>'allow' and r.reviewed_at is null)::int as pending_count
      from adorable.projects p join adorable.profiles pr on pr.id=p.owner_id
      left join adorable.prompt_reviews r on r.vm_id=p.vm_id
      where ${teacherStudentAccessSQL("p.owner_id")}
      group by p.vm_id,pr.display_name order by max(r.created_at) desc nulls last,p.updated_at desc`,
      [user.id],
    );
    return Response.json({ projects: rows });
  }
  const projectId = params.get("projectId");
  if (projectId && !/^vm-[a-z0-9]+$/.test(projectId))
    return Response.json({ error: "Invalid project." }, { status: 400 });
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
    `select r.*,p.metadata->>'name' as project_name,pr.display_name as child_name from adorable.prompt_reviews r join adorable.projects p on p.vm_id=r.vm_id join adorable.profiles pr on pr.id=r.child_id where ${scope} and ($2::timestamptz is null or (r.created_at,r.id)<($2::timestamptz,$3::uuid)) and (not $4::boolean or r.decision<>'allow') and ($5::text is null or r.vm_id=$5) order by r.created_at desc,r.id desc limit 500`,
    [
      user.id,
      before?.time || null,
      before?.id || null,
      params.get("flags") === "1",
      projectId,
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
