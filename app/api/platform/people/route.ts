import { createStudentSchoolInvite } from "@/lib/student-invites";
import { database } from "@/lib/database";
import {
  checkOrigin,
  getProfile,
  platformEnabled,
  inviteToken,
  tokenHash,
} from "@/lib/platform-auth";
import { groupManagerSQL } from "@/lib/project-group";
import {
  searchDirectoryPeople,
  addDirectoryPerson,
} from "@/lib/people-directory";
export async function POST(req: Request) {
  const user = platformEnabled() ? await getProfile() : null;
  if (user?.role !== "teacher" || !checkOrigin(req))
    return Response.json({ error: "Staff access required." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (
    !["teacher", "student"].includes(b.role) ||
    (b.classId && !/^[a-f0-9-]{36}$/i.test(b.classId)) ||
    !["lookup", "search", "add", "invite", "remove"].includes(b.action)
  )
    return Response.json(
      { error: "Choose a classroom and action." },
      { status: 400 },
    );
  try {
    if (b.action === "invite" && b.role === "student") {
      const token = await createStudentSchoolInvite(
        database(),
        user.id,
        b.classId || undefined,
      );
      const origin = process.env.DREAMFORGE_SITE_URL || new URL(req.url).origin;
      return Response.json({ link: `${origin}/signup?studentInvite=${token}` });
    }
    if (b.action === "invite" && b.role === "teacher" && !b.classId) {
      const db = database();
      const actor = (
        await db.query(
          "select school_id from profiles where id=$1 and role='teacher'",
          [user.id],
        )
      ).rows[0];
      const token = inviteToken();
      await db.query(
        "insert into teacher_invites(token_hash,created_by,school_id) values($1,$2,$3)",
        [tokenHash(token), user.id, actor?.school_id || null],
      );
      return Response.json({
        link: `${process.env.DREAMFORGE_SITE_URL || new URL(req.url).origin}/signup?teacherInvite=${token}`,
      });
    }
    if (b.action === "invite") {
      const db = database();
      const c = (
        await db.query(
          `select c.id,c.invite_code,c.school_id from classes c join profiles o on o.id=c.teacher_id where c.id=$1 and ${groupManagerSQL("c.id", "$2")}`,
          [b.classId, user.id],
        )
      ).rows[0];
      if (!c) throw Error("Choose a classroom you manage.");
      const origin = process.env.DREAMFORGE_SITE_URL || new URL(req.url).origin;
      const token = inviteToken();
      await db.query(
        "insert into teacher_invites(token_hash,created_by,classroom_id,school_id) values($1,$2,$3,$4)",
        [tokenHash(token), user.id, c.id, c.school_id],
      );
      return Response.json({ link: `${origin}/classrooms/invite/${token}` });
    }
    if (
      typeof b.identifier !== "string" ||
      !b.identifier.trim() ||
      b.identifier.length > 254
    )
      throw Error("Enter a username or email.");
    if (b.action === "search")
      return Response.json({
        people: await searchDirectoryPeople(database(), user.id, b),
      });
    return Response.json({
      person: await addDirectoryPerson(database(), user.id, b),
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Could not add person." },
      { status: 400 },
    );
  }
}
