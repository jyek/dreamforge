import { teacherStudentAccessSQL } from "@/lib/classroom-permissions";
import { database } from "@/lib/database";
import { getProfile, platformEnabled, checkOrigin } from "@/lib/platform-auth";
export async function POST(req: Request) {
  const user = platformEnabled() ? await getProfile() : null;
  if (user?.role !== "teacher" || !checkOrigin(req))
    return Response.json(
      { error: "Teacher access required." },
      { status: 403 },
    );
  const body = await req.json().catch(() => ({}));
  if (typeof body.id !== "string" || !/^[a-f0-9-]{36}$/i.test(body.id))
    return Response.json({ error: "Invalid request." }, { status: 400 });
  const db = await database().connect();
  try {
    await db.query("begin");
    const { rows } = await db.query(
      `select r.* from usage_runs r where r.id=$2 and r.state='uncertain' and ${teacherStudentAccessSQL("r.child_id")} for update`,
      [user.id, body.id],
    );
    if (!rows[0]) {
      await db.query("rollback");
      return Response.json(
        { error: "This hold is not available." },
        { status: 404 },
      );
    }
    await db.query(
      "update token_accounts set reserved_tokens=reserved_tokens-$2 where child_id=$1",
      [rows[0].child_id, rows[0].reserved_tokens],
    );
    await db.query(
      "update usage_runs set state='released',released_by=$2 where id=$1",
      [body.id, user.id],
    );
    await db.query("commit");
    return Response.json({ ok: true });
  } catch {
    await db.query("rollback");
    return Response.json(
      { error: "Could not release the hold." },
      { status: 503 },
    );
  } finally {
    db.release();
  }
}
