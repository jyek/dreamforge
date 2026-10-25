import Link from "next/link";
import { database } from "@/lib/database";
import { getProfile, tokenHash } from "@/lib/platform-auth";
import { JoinTeacherClassroom } from "@/components/join-teacher-classroom";
import { DreamForgeBrand } from "@/components/dreamforge-brand";
import { classroomTeacherSQL } from "@/lib/classroom-permissions";
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const user = await getProfile();
  const { rows } = await database().query(
    "select c.id,c.name,i.used_by,i.used_at from adorable.teacher_invites i join adorable.classes c on c.id=i.classroom_id where i.token_hash=$1 and i.expires_at>now()",
    [tokenHash(token)],
  );
  const invite = rows[0];
  const { rowCount } =
    user?.role === "teacher" && invite
      ? await database().query(
          `select 1 where ${classroomTeacherSQL("$1", "$2")}`,
          [invite.id, user.id],
        )
      : { rowCount: 0 };
  const usable = invite && (!invite.used_at || rowCount);
  const next = `/classrooms/invite/${encodeURIComponent(token)}`;
  return (
    <main className="df-page">
      <DreamForgeBrand />
      <section className="df-card df-teacher-invitation">
        <h1>
          {usable
            ? `Help teach ${invite.name}`
            : "This invitation is unavailable"}
        </h1>
        <p className="df-muted">
          {usable
            ? "Join the teaching team to review student projects, support their learning, and share your own classroom projects."
            : "Ask the classroom owner for a new invitation link."}
        </p>
        {usable &&
          (rowCount ? (
            <Link className="df-button" href={`/classrooms/${invite.id}`}>
              Open classroom
            </Link>
          ) : !user ? (
            <div className="df-inline">
              <Link
                className="df-button"
                href={`/login?next=${encodeURIComponent(next)}`}
              >
                Sign in as a teacher
              </Link>
              <Link
                className="df-button secondary"
                href={`/signup?teacherInvite=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`}
              >
                Create a teacher account
              </Link>
            </div>
          ) : user.role === "teacher" ? (
            <JoinTeacherClassroom token={token} />
          ) : (
            <p className="df-muted">
              This invitation is for teachers. Sign out of your student account
              in Profile, then sign in as a teacher.
            </p>
          ))}
      </section>
    </main>
  );
}
