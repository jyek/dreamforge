"use client";
import { StudentReviewTable } from "./student-review-table";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  PlatformDashboardLayout,
  schoolSectionPath,
} from "./platform-dashboard-layout";
import { SchoolTeachers } from "./school-teachers";
import { SchoolStudents, type SchoolStudent } from "./school-students";
import { TeacherActionSummary } from "./teacher-action-summary";
import { TeacherPromptGuidance } from "./teacher-prompt-guidance";
import { SchoolSetup } from "./school-setup";
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
  projects: number;
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
  const router = useRouter();
  const alerts = initial.alerts || [];
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
          <div
            className="df-inline"
            style={{ marginTop: 24, justifyContent: "flex-end" }}
          >
            <SchoolSetup teachers={initial.teachers} />
          </div>
          <StudentReviewTable
            columns={5}
            compact={false}
            className="df-school-classroom-directory"
          >
            <thead>
              <tr>
                <th scope="col">Classroom</th>
                <th scope="col">Lead Teacher</th>
                <th scope="col">Co-Teachers</th>
                <th scope="col">Students</th>
                <th scope="col">Projects</th>
              </tr>
            </thead>
            <tbody>
              {initial.classes.map((c) => (
                <tr
                  key={c.id}
                  className="df-clickable-row"
                  tabIndex={0}
                  aria-label={`Enter classroom ${c.name}`}
                  onClick={() => router.push(`/classrooms/${c.id}`)}
                  onKeyDown={(e) => {
                    if (
                      e.target === e.currentTarget &&
                      (e.key === "Enter" || e.key === " ")
                    ) {
                      e.preventDefault();
                      router.push(`/classrooms/${c.id}`);
                    }
                  }}
                >
                  <td>
                    <strong>{c.name}</strong>
                  </td>
                  <td>
                    {c.teachers?.find((t) => t.is_owner)?.display_name ||
                      c.teacher_name}
                  </td>
                  <td>
                    <div className="df-directory-classes">
                      {c.teachers?.some((t) => !t.is_owner)
                        ? c.teachers
                            .filter((t) => !t.is_owner)
                            .map((t) => (
                              <span key={t.id}>{t.display_name}</span>
                            ))
                        : "—"}
                    </div>
                  </td>
                  <td>{c.students}</td>
                  <td>{c.projects ?? 0}</td>
                </tr>
              ))}
              {!initial.classes.length && (
                <tr>
                  <td colSpan={5} className="df-directory-empty">
                    No classrooms yet. Create a classroom to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </StudentReviewTable>
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
