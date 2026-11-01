"use client";
import { StudentReviewTable } from "./student-review-table";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  PlatformDashboardLayout,
  schoolSectionPath,
} from "./platform-dashboard-layout";
import { DashboardDetailHeader } from "./dashboard-detail-header";
import { SchoolTeachers } from "./school-teachers";
import { SchoolStudents, type SchoolStudent } from "./school-students";
import { TeacherActionSummary } from "./teacher-action-summary";
import { TeacherPromptGuidance } from "./teacher-prompt-guidance";
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
  return (
    <PlatformDashboardLayout
      teacher
      schoolMode
      name={name}
      schoolName={initial.school.name}
      section={section}
      onSectionChange={navigate}
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
  const [selected, setSelected] = useState<string | null>(null);
  const alerts = initial.alerts || [],
    current = initial.classes.find((c) => c.id === selected);
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
          <div className="df-overview-badges">
            {[
              ["classes", "Classrooms", initial.classes.length],
              ["teachers", "Teachers", initial.teachers.length],
              ["students", "Students", initial.students],
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
                className="df-overview-badge"
                key={i}
                onClick={() => onNavigate?.(String(target))}
              >
                <span>{label}</span>
                <strong>{count}</strong>
              </button>
            ))}
          </div>
          <TeacherActionSummary />
        </>
      )}
      {section === "students" && (
        <SchoolStudents
          students={initial.studentList || []}
          classrooms={initial.classes}
        />
      )}
      {section === "classes" && (
        <>
          {!current && (
            <div
              className="df-inline"
              style={{ marginTop: 24, justifyContent: "flex-end" }}
            >
              <SchoolSetup teachers={initial.teachers} />
            </div>
          )}
          {current ? (
            <>
              <DashboardDetailHeader
                title={current.name}
                subtitle={
                  <>
                    Class code: <strong>{current.invite_code}</strong>
                  </>
                }
                back={
                  <button
                    className="df-button secondary small"
                    onClick={() => setSelected(null)}
                  >
                    ← All classrooms
                  </button>
                }
              />
              <div className="df-section-head">
                <h3>Teachers</h3>
                <SchoolSetup teachers={initial.teachers} classroom={current} />
              </div>
              {people(current.teachers || [], true)}
              <ClassroomGroups classId={current.id} />
              <button
                className="df-button secondary"
                onClick={() => {
                  onNavigate?.("alerts");
                }}
              >
                View class safety alerts
              </button>
            </>
          ) : (
            <StudentReviewTable
              columns={4}
              compact={false}
              className="df-school-classroom-directory"
            >
              <thead>
                <tr>
                  <th scope="col">Classroom</th>
                  <th scope="col">Teaching team</th>
                  <th scope="col">Students</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {initial.classes.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <button
                        className="df-class-text-link"
                        type="button"
                        onClick={() => setSelected(c.id)}
                      >
                        {c.name}
                      </button>
                    </td>
                    <td>
                      <div className="df-directory-classes">
                        {c.teachers?.length
                          ? c.teachers.map((t) => (
                              <span key={t.id}>
                                {t.display_name}
                                {t.is_owner && (
                                  <small className="df-muted">
                                    {" "}
                                    · Lead teacher
                                  </small>
                                )}
                              </span>
                            ))
                          : c.teacher_name}
                      </div>
                      <small className="df-muted">
                        {c.teachers?.length || 1}{" "}
                        {(c.teachers?.length || 1) === 1
                          ? "teacher"
                          : "teachers"}
                      </small>
                    </td>
                    <td>{c.students}</td>
                    <td>
                      <div className="df-inline">
                        <button
                          type="button"
                          className="df-button secondary small"
                          onClick={() => setSelected(c.id)}
                          aria-label={`View ${c.name}`}
                        >
                          Enter classroom
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!initial.classes.length && (
                  <tr>
                    <td colSpan={4} className="df-directory-empty">
                      No classrooms yet. Create a classroom to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </StudentReviewTable>
          )}
        </>
      )}
      {section === "teachers" && (
        <SchoolTeachers
          teachers={initial.teachers.map((t) => ({
            ...t,
            classrooms: initial.classes
              .filter((c) => c.teachers?.some((p) => p.id === t.id))
              .map((c) => ({ id: c.id, name: c.name })),
          }))}
          classrooms={initial.classes}
        />
      )}
      {section === "alerts" && <TeacherPromptGuidance scope="school" />}
    </>
  );
}
