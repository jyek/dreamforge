"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  PlatformDashboardLayout,
  schoolSectionPath,
} from "./platform-dashboard-layout";
import { SchoolStudents, type SchoolStudent } from "./school-students";
import { SchoolSetup } from "./school-setup";
import { ClassroomGroups } from "./classroom-groups";
import { ClassroomAvatar } from "./classroom-avatar";
type Person = {
  id: string;
  display_name: string;
  username: string;
  is_owner?: boolean;
};
type Classroom = {
  id: string;
  name: string;
  teacher_name: string;
  students: number;
  teachers?: Person[];
  roster?: Person[];
  invite_code?: string;
};
type Alert = {
  id: string;
  child_id: string;
  child_name: string;
  project_name: string;
  content: string;
  decision: string;
  hold_status: string | null;
  categories: string[];
  created_at: string;
  reviewed_at: string | null;
  reviewer_name: string | null;
  classrooms: { id: string; name: string }[];
};
type Overview = {
  school: { id: string; name: string };
  teachers: (Person & { is_admin: boolean; classes: number })[];
  classes: Classroom[];
  students: number;
  studentList?: SchoolStudent[];
  flagged_30d: number;
  alerts?: Alert[];
};
const status = (a: Alert) =>
  a.hold_status === "approved"
    ? "Approved by teacher"
    : a.hold_status === "denied"
      ? "Declined by teacher"
      : a.hold_status === "pending"
        ? "Awaiting approval"
        : a.decision === "block"
          ? "Blocked"
          : "Flagged";
export function SchoolOverview({
  initial,
  name,
  initialSection = "overview",
}: {
  initial: Overview;
  name: string;
  initialSection?: string;
}) {
  const router = useRouter(),
    [section, setSection] = useState(initialSection);
  useEffect(() => setSection(initialSection), [initialSection]);
  function navigate(s: string) {
    setSection(s);
    router.push(schoolSectionPath(s));
  }
  const sectionCount =
    section === "teachers"
      ? `${initial.teachers.length} ${initial.teachers.length === 1 ? "teacher" : "teachers"}`
      : section === "students"
        ? `${initial.students} ${initial.students === 1 ? "student" : "students"}`
        : section === "classes"
          ? `${initial.classes.length} ${initial.classes.length === 1 ? "classroom" : "classrooms"}`
          : null;
  return (
    <PlatformDashboardLayout
      teacher
      schoolMode
      name={name}
      schoolName={initial.school.name}
      section={section}
      onSectionChange={navigate}
      headerAction={
        sectionCount ? (
          <span className="df-pill">{sectionCount}</span>
        ) : undefined
      }
    >
      <SchoolOverviewContent
        initial={initial}
        section={section}
        onNavigate={navigate}
      />
    </PlatformDashboardLayout>
  );
}
export function SchoolOverviewContent({
  initial,
  section = "overview",
  onNavigate,
}: {
  initial: Overview;
  section?: string;
  onNavigate?: (s: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null),
    [filter, setFilter] = useState("all"),
    [classFilter, setClassFilter] = useState("all"),
    [limit, setLimit] = useState(50);
  const alerts = initial.alerts || [],
    current = initial.classes.find((c) => c.id === selected);
  const visible = alerts.filter(
    (a) =>
      (filter === "all" ||
        (filter === "blocked"
          ? a.decision === "block"
          : a.hold_status === filter)) &&
      (classFilter === "all" || a.classrooms.some((c) => c.id === classFilter)),
  );
  const people = (rows: Person[], teacher: boolean) => (
    <div className="df-school-list">
      {rows.length ? (
        rows.map((p) => (
          <div className="df-school-row" key={p.id}>
            <div className="df-inline">
              <ClassroomAvatar
                identity={p.id}
                role={teacher ? "teacher" : "student"}
              />
              <strong>{p.display_name}</strong>
            </div>
            <small>
              @{p.username}
              {teacher
                ? p.is_owner
                  ? " · Classroom owner"
                  : " · Co-teacher"
                : ""}
            </small>
          </div>
        ))
      ) : (
        <p>No {teacher ? "teachers" : "students"} yet.</p>
      )}
    </div>
  );
  return (
    <>
      {section === "overview" && (
        <>
          <div className="df-projects">
            {[
              ["classes", "Classrooms", initial.classes.length],
              ["teachers", "Teachers", initial.teachers.length],
              [
                "alerts",
                "Awaiting teacher approval",
                alerts.filter((a) => a.hold_status === "pending").length,
              ],
              [
                "alerts",
                "Safety alerts in the last 30 days",
                initial.flagged_30d,
              ],
            ].map(([target, label, count], i) => (
              <button
                className="df-card df-project"
                key={i}
                onClick={() => onNavigate?.(String(target))}
              >
                <h3>{label}</h3>
                <strong>{count}</strong>
                <footer>View →</footer>
              </button>
            ))}
          </div>
          <h3>Recent safety activity</h3>
          {alerts.slice(0, 5).map((a) => (
            <div className="df-school-row" key={a.id}>
              <strong>
                {a.child_name} · {status(a)}
              </strong>
              <small>
                {a.project_name || "Project"} ·{" "}
                {new Date(a.created_at).toLocaleString()}
              </small>
            </div>
          ))}
          {!alerts.length && <p>No safety alerts recorded.</p>}
        </>
      )}
      {section === "classes" && (
        <SchoolSetup initial={initial} section={section} />
      )}
      {section === "students" && (
        <SchoolStudents
          students={initial.studentList || []}
          classrooms={initial.classes}
        />
      )}
      {section === "classes" && (
        <>
          {current ? (
            <>
              <button
                className="df-button secondary small"
                onClick={() => setSelected(null)}
              >
                ← All classrooms
              </button>
              <h3>{current.name}</h3>
              <p>
                Student signup class code:{" "}
                <strong>{current.invite_code}</strong>
              </p>
              <ClassroomGroups classId={current.id} />
              <h3>Teaching team</h3>
              {people(current.teachers || [], true)}
              <h3>Students · {current.roster?.length || 0}</h3>
              {people(current.roster || [], false)}
              <button
                className="df-button secondary"
                onClick={() => {
                  setClassFilter(current.id);
                  onNavigate?.("alerts");
                }}
              >
                View class safety alerts
              </button>
            </>
          ) : (
            <div className="df-projects">
              {initial.classes.map((c) => (
                <button
                  className="df-card df-project"
                  key={c.id}
                  onClick={() => setSelected(c.id)}
                >
                  <h3>{c.name}</h3>
                  <p>
                    {(c.teachers || []).map((t) => t.display_name).join(", ") ||
                      c.teacher_name}
                  </p>
                  <footer>{c.students} students · View classroom →</footer>
                </button>
              ))}
              {!initial.classes.length && <p>No classrooms yet.</p>}
            </div>
          )}
        </>
      )}
      {section === "teachers" && (
        <div className="df-guidance-table df-school-teacher-directory">
          <table className="df-table">
            <thead>
              <tr>
                <th scope="col">Teacher</th>
                <th scope="col">Role</th>
                <th scope="col">Classrooms</th>
              </tr>
            </thead>
            <tbody>
              {initial.teachers.map((t) => (
                <tr key={t.id}>
                  <td>
                    <div className="df-directory-person">
                      <ClassroomAvatar identity={t.id} role="teacher" />
                      <div>
                        <strong>{t.display_name}</strong>
                        <small>@{t.username}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="df-guidance-tag">
                      {t.is_admin ? "School Admin" : "Teacher"}
                    </span>
                  </td>
                  <td>
                    <div className="df-directory-classes">
                      {initial.classes
                        .filter((c) => c.teachers?.some((p) => p.id === t.id))
                        .map((c) => (
                          <button
                            type="button"
                            className="df-class-text-link"
                            key={c.id}
                            onClick={() => {
                              setSelected(c.id);
                              onNavigate?.("classes");
                            }}
                          >
                            {c.name} <span aria-hidden="true">→</span>
                          </button>
                        ))}
                      {t.classes === 0 && (
                        <span className="df-muted">No classrooms assigned</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {initial.teachers.length === 0 && (
                <tr>
                  <td colSpan={3} className="df-directory-empty">
                    No teachers yet. Create an invitation from your profile to
                    add someone.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {section === "alerts" && (
        <>
          <p>
            School-wide visibility. Prompt decisions are made by the student's
            classroom teachers in their classroom action queue.
          </p>
          <div className="df-inline">
            <label>
              Status{" "}
              <select
                className="df-input"
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setLimit(50);
                }}
              >
                <option value="all">All safety alerts</option>
                <option value="pending">Awaiting approval</option>
                <option value="approved">Approved by teacher</option>
                <option value="denied">Declined by teacher</option>
                <option value="blocked">Blocked</option>
              </select>
            </label>
            <label>
              Classroom{" "}
              <select
                className="df-input"
                value={classFilter}
                onChange={(e) => {
                  setClassFilter(e.target.value);
                  setLimit(50);
                }}
              >
                <option value="all">All classrooms</option>
                {initial.classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <span>{visible.length} alerts</span>
          </div>
          <p className="df-muted">
            Classroom labels reflect current enrollment. They do not identify
            where an older request originated.
          </p>
          {visible.slice(0, limit).map((a) => (
            <article
              className={
                "df-safety-item" +
                (a.hold_status === "pending" ? " df-safety-pending" : "")
              }
              key={a.id}
            >
              <header>
                <strong>{a.child_name}</strong>
                <span className="df-pill">{status(a)}</span>
                <small>
                  {new Date(a.created_at).toLocaleString()} ·{" "}
                  {a.project_name || "Project"}
                </small>
              </header>
              <p className="df-safety-prompt">“{a.content}”</p>
              <small>
                {a.categories.join(", ")} ·{" "}
                {a.classrooms.map((c) => c.name).join(", ") ||
                  "No current classroom"}
              </small>
              {a.reviewed_at && (
                <p>
                  Reviewed by {a.reviewer_name || "a teacher"} ·{" "}
                  {new Date(a.reviewed_at).toLocaleString()}
                </p>
              )}
            </article>
          ))}
          {!visible.length && <p>No safety alerts match these filters.</p>}
          {visible.length > limit && (
            <button
              className="df-button secondary"
              onClick={() => setLimit(limit + 50)}
            >
              Show more alerts
            </button>
          )}
        </>
      )}
    </>
  );
}
