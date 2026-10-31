"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CopyButton } from "./copy-button";
import { PlatformDashboardLayout } from "./platform-dashboard-layout";
type Overview = {
  school: { id: string; name: string };
  teachers: {
    id: string;
    display_name: string;
    username: string;
    is_admin: boolean;
    classes: number;
  }[];
  classes: {
    id: string;
    name: string;
    teacher_name: string;
    students: number;
  }[];
  students: number;
  flagged_30d: number;
};
export function SchoolOverview({
  initial,
  name,
}: {
  initial: Overview;
  name: string;
}) {
  const router = useRouter();
  return (
    <PlatformDashboardLayout
      teacher
      name={name}
      section="school"
      onSectionChange={(s) => router.push(`/${s}`)}
    >
      <SchoolOverviewContent initial={initial} />
    </PlatformDashboardLayout>
  );
}
export function SchoolOverviewContent({ initial }: { initial: Overview }) {
  const [link, setLink] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function invite(admin: boolean) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/platform/school", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setLink(d.link);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="df-section-head">
        <h2>{initial.school.name}</h2>
        <span>
          {initial.teachers.length} teachers · {initial.classes.length} classes
          · {initial.students} students
        </span>
      </div>
      <p>
        {initial.flagged_30d} blocked or questionable prompts in the last 30
        days across your school.
      </p>
      <h3>Teachers</h3>
      <div className="df-school-list">
        {initial.teachers.map((t) => (
          <div className="df-school-row" key={t.id}>
            <strong>{t.display_name}</strong>
            <small>
              @{t.username}
              {t.is_admin ? " · School administrator" : ""} · {t.classes}{" "}
              {t.classes === 1 ? "class" : "classes"}
            </small>
          </div>
        ))}
      </div>
      <div className="df-inline">
        <button
          className="df-button"
          disabled={busy}
          onClick={() => invite(false)}
        >
          {busy ? "Working…" : "Invite a teacher"}
        </button>
        <button
          className="df-button secondary"
          disabled={busy}
          onClick={() => invite(true)}
        >
          Invite another administrator
        </button>
      </div>
      {link && (
        <div className="df-notice">
          <p>
            Send this private link to the teacher. It works once and expires in
            seven days.
          </p>
          <div className="df-inline">
            <input
              className="df-input"
              readOnly
              aria-label="Invitation link"
              value={link}
            />
            <CopyButton value={link} className="df-button secondary small">
              Copy link
            </CopyButton>
          </div>
        </div>
      )}
      {error && (
        <p className="df-error" role="alert">
          {error}
        </p>
      )}
      <h3>Classes</h3>
      <div className="df-school-list">
        {!initial.classes.length && <p>No classes yet.</p>}
        {initial.classes.map((c) => (
          <div className="df-school-row" key={c.id}>
            <strong>{c.name}</strong>
            <small>
              {c.teacher_name} · {c.students}{" "}
              {c.students === 1 ? "student" : "students"}
            </small>
          </div>
        ))}
      </div>
    </>
  );
}
