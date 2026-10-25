import { childPolicy } from "@/lib/child-policy";
import { database } from "@/lib/database";
import {
  saveLoginSession,
  clearLoginSession,
  supabaseKey,
  supabaseUrl,
} from "@/lib/student-session";
import {
  checkOrigin,
  getProfile,
  limitAuth,
  platformEnabled,
  tokenHash,
} from "@/lib/platform-auth";
import { randomUUID } from "node:crypto";
const fail = (error: string, status = 400) =>
  Response.json({ error }, { status });
export async function GET() {
  return Response.json({
    policy: childPolicy(),
    enabled: platformEnabled(),
    user: platformEnabled() ? await getProfile() : null,
  });
}
export async function DELETE(req: Request) {
  if (!checkOrigin(req)) return fail("Invalid request", 403);
  await clearLoginSession();
  return Response.json({ ok: true });
}
export async function PATCH(req: Request) {
  if (!platformEnabled()) return fail("Account setup is not enabled yet.", 503);
  if (!checkOrigin(req)) return fail("Invalid request", 403);
  const user = await getProfile();
  if (!user) return fail("Sign in first.", 401);
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 60 || /[\u0000-\u001f\u007f]/.test(name))
    return fail("Use a display name with 1–60 characters.");
  await database().query(
    "update adorable.profiles set display_name=$2 where id=$1",
    [user.id, name],
  );
  return Response.json({ ok: true, name });
}
export async function POST(req: Request) {
  if (!platformEnabled()) return fail("Account setup is not enabled yet.", 503);
  if (!checkOrigin(req)) return fail("Invalid request", 403);
  if (!(await limitAuth(req)))
    return fail("Too many attempts. Please try again in ten minutes.", 429);
  const body = await req.json().catch(() => ({}));
  if (
    typeof body.password !== "string" ||
    body.password.length < 8 ||
    body.password.length > 128
  )
    return fail("Use a password with 8–128 characters.");
  const admin = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { apikey: supabaseKey(), "Content-Type": "application/json" };
  let email: string;
  if (body.action === "signup") {
    if (!admin) return fail("Account setup is unavailable.", 503);
    const username =
      typeof body.username === "string"
        ? body.username.trim().toLowerCase()
        : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const suppliedEmail =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!/^[a-z0-9_]{3,30}$/.test(username) || !name || name.length > 60)
      return fail(
        "Use a name and a username of 3–30 letters, numbers or underscores.",
      );
    if (
      suppliedEmail &&
      (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(suppliedEmail) ||
        suppliedEmail.length > 254)
    )
      return fail("Enter a valid email.");
    const teacher =
      typeof body.teacherInvite === "string" && body.teacherInvite.length > 0;
    if (teacher && !suppliedEmail)
      return fail("Teachers need an email address.");
    const code =
      typeof body.classCode === "string"
        ? body.classCode.trim().toUpperCase()
        : "";
    email = suppliedEmail || `${randomUUID()}@children.dreamforge.invalid`;
    const db = await database().connect();
    let authId: string | undefined;
    try {
      await db.query("begin");
      const invitation = teacher
        ? await db.query(
            "select token_hash from adorable.teacher_invites where token_hash=$1 and used_at is null and expires_at>now() for update",
            [tokenHash(body.teacherInvite)],
          )
        : code
          ? await db.query(
              "select id from adorable.classes where invite_code=$1 for share",
              [code],
            )
          : { rows: [] };
      if ((teacher || code) && !invitation.rows[0]) {
        await db.query("rollback");
        return fail("This invitation code is invalid or expired.");
      }
      const response = await fetch(`${supabaseUrl()}/auth/v1/admin/users`, {
        method: "POST",
        headers: {
          apikey: admin,
          Authorization: `Bearer ${admin}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password: body.password,
          email_confirm: true,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      if (!response.ok || !result.id) {
        await db.query("rollback");
        return fail(
          "Could not create this account. If you already have an account, sign in and join your class.",
        );
      }
      authId = result.id;
      await db.query(
        "insert into adorable.profiles(id,username,display_name,auth_email,role) values($1,$2,$3,$4,$5)",
        [authId, username, name, email, teacher ? "teacher" : "child"],
      );
      if (teacher)
        await db.query(
          "update adorable.teacher_invites set used_by=$2,used_at=now() where token_hash=$1",
          [tokenHash(body.teacherInvite), authId],
        );
      else {
        if (code)
          await db.query(
            "insert into adorable.class_members(class_id,child_id) values($1,$2)",
            [invitation.rows[0].id, authId],
          );
        await db.query(
          "insert into adorable.token_accounts(child_id) values($1)",
          [authId],
        );
      }
      await db.query("commit");
    } catch {
      await db.query("rollback");
      if (authId)
        await fetch(`${supabaseUrl()}/auth/v1/admin/users/${authId}`, {
          method: "DELETE",
          headers: { apikey: admin, Authorization: `Bearer ${admin}` },
        }).catch(() => {});
      return fail(
        "Could not create this account. Try a different username or sign in.",
        409,
      );
    } finally {
      db.release();
    }
  } else {
    const login =
      typeof body.login === "string" ? body.login.trim().toLowerCase() : "";
    if (!login || login.length > 254)
      return fail("Enter your username or email.");
    const { rows } = await database().query(
      "select auth_email from adorable.profiles where username=$1 or auth_email=$1",
      [login],
    );
    // Always perform a password exchange, even for an unknown username.
    email =
      rows[0]?.auth_email || `${randomUUID()}@children.dreamforge.invalid`;
  }
  try {
    const response = await fetch(
      `${supabaseUrl()}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ email, password: body.password }),
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      },
    );
    const session = await response.json();
    if (!response.ok || !session.access_token)
      return fail(
        "Sign-in failed. Check your username/email and password.",
        401,
      );
    await saveLoginSession(session);
    return Response.json({ ok: true });
  } catch {
    return fail("Sign-in is temporarily unavailable.", 503);
  }
}
