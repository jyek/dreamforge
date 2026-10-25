import { childPolicy } from "@/lib/child-policy";
import { safetyEnabled, moderationConfigured } from "@/lib/safety-mode";
import { demoMode } from "@/lib/demo-mode";
import {
  getStudentSession,
  saveLoginSession,
  clearLoginSession,
  supabaseKey,
  supabaseUrl,
} from "@/lib/student-session";
import { database } from "@/lib/database";
export async function GET() {
  if (demoMode())
    return Response.json({
      policy: childPolicy(),
      demo: true,
      user: null,
      safety: {
        enabled: safetyEnabled(),
        moderationReady: moderationConfigured(),
        method: "remote-under-13",
        classroomModerationReady: moderationConfigured(),
      },
    });
  const user = await getStudentSession();
  if (!user) return Response.json({ user: null }, { status: 401 });
  try {
    const { rows } = await database().query(
      `select exists(select 1 from classrooms where owner_id=$1) as teacher,
      exists(select 1 from students where user_id=$1) as enrolled`,
      [user.id],
    );
    return Response.json({
      policy: childPolicy(),
      user: {
        id: user.id,
        role: rows[0].teacher ? "teacher" : "student",
        enrolled: rows[0].enrolled,
      },
    });
  } catch {
    return Response.json(
      {
        error:
          "Student database setup is incomplete. Ask your teacher to finish the connection.",
      },
      { status: 503 },
    );
  }
}
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (
    typeof body.email !== "string" ||
    typeof body.password !== "string" ||
    body.email.length > 254 ||
    body.password.length > 1024
  )
    return Response.json(
      { error: "Enter your email and password." },
      { status: 400 },
    );
  try {
    const response = await fetch(
      `${supabaseUrl()}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: { apikey: supabaseKey(), "Content-Type": "application/json" },
        body: JSON.stringify({ email: body.email, password: body.password }),
        cache: "no-store",
      },
    );
    const session = await response.json();
    if (!response.ok || !session.access_token)
      return Response.json(
        {
          error:
            "Sign-in failed. Check your login details or ask your teacher.",
        },
        { status: 401 },
      );
    await saveLoginSession(session);
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Sign-in service is unavailable. Please try again." },
      { status: 503 },
    );
  }
}
export async function DELETE() {
  await clearLoginSession();
  return Response.json({ ok: true });
}
