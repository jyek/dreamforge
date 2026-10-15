"use client";
import { StudentReviewTable } from "./student-review-table";
import { NoClassroomProjects } from "./no-classroom-projects";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DreamLoading } from "./dream-loading";
import {
  ClassProjectAssignments,
  type AssignableProject,
} from "./class-project-assignments";
import { TableEmptyState } from "./table-empty-state";
import { PlatformDashboardLayout } from "./platform-dashboard-layout";
import {
  TeacherPromptGuidance,
  type GuidanceStudent,
} from "./teacher-prompt-guidance";
type Project = {
  vm_id: string;
  owner_id: string;
  name: string;
  conversation_id: string | null;
  prompt_count: number;
  guidance_count: number;
};
export type StudentProjectsData = {
  classroom?: { name: string; teacher_name?: string };
  availableProjects?: AssignableProject[];
  students: GuidanceStudent[];
  projects: Project[];
};
export function TeacherStudentProjects({
  teacherName,
  classId,
  studentId,
  initialData,
}: {
  teacherName: string;
  classId?: string;
  studentId?: string;
  initialData?: StudentProjectsData;
}) {
  const router = useRouter();
  const [data, setData] = useState<StudentProjectsData | null>(
      initialData || null,
    ),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [selection, setSelection] = useState<{
      student: GuidanceStudent;
      project: Project;
    } | null>(null);
  useEffect(() => {
    if (initialData) return;
    const controller = new AbortController();
    fetch(
      classId
        ? `/api/platform/classes/${classId}`
        : `/api/platform/student-projects?studentId=${studentId}`,
      { signal: controller.signal },
    )
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error || "Could not load projects.");
        setData(d);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [classId, studentId, initialData]);
  const shown =
    data?.students.filter((s) =>
      `${s.display_name} ${s.username}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) || [];
  const teachingProjects =
    data?.projects.filter(
      (p) => !data.students.some((s) => s.id === p.owner_id) && !search,
    ) || [];
  return (
    <PlatformDashboardLayout
      teacher
      name={teacherName}
      section={classId ? "classrooms" : "students"}
      headerAction={
        classId && data?.availableProjects ? (
          <ClassProjectAssignments
            classId={classId}
            projects={data.availableProjects}
            onChanged={async () => {
              const r = await fetch(`/api/platform/classes/${classId}`);
              const d = await r.json();
              if (!r.ok) throw Error(d.error);
              setData(d);
            }}
          />
        ) : undefined
      }
      onSectionChange={(s) => router.push(`/${s}`)}
    >
      <Link className="df-purple" href={classId ? "/classrooms" : "/students"}>
        ← {classId ? "Classrooms" : "Students"}
      </Link>
      <div className="df-section-head">
        <h2>
          {data?.classroom?.name ||
            (data?.students[0]
              ? `${data.students[0].display_name} · Projects`
              : "Student projects")}
        </h2>
        {classId && data && (
          <span className="df-muted">{data.students.length} students</span>
        )}
      </div>
      <p className="df-muted">
        Explore student projects, prompts and safety alerts. Student workspaces
        are read-only for teachers.
      </p>
      {error ? (
        <p role="alert" className="df-error">
          {error}
        </p>
      ) : !data ? (
        <DreamLoading label="Loading projects…" />
      ) : selection ? (
        <>
          <button
            className="df-button secondary small"
            onClick={() => setSelection(null)}
          >
            ← Student projects
          </button>
          <TeacherPromptGuidance
            key={selection.project.vm_id}
            initialStudent={selection.student}
            initialProjectId={selection.project.vm_id}
          />
        </>
      ) : (
        <>
          {classId && (
            <label className="df-guidance-filters">
              Find a student
              <input
                className="df-input"
                style={{ maxWidth: 340 }}
                placeholder="Name or username…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          )}
          <StudentReviewTable
            className="df-student-project-table"
            empty={!shown.length && !teachingProjects.length}
          >
            <thead>
              <tr>
                <th>Student</th>
                <th>Project</th>
                <th>Prompts</th>
                <th>Safety alerts</th>
                <th>Explore</th>
              </tr>
            </thead>
            <tbody>
              {teachingProjects.map((project) => (
                <tr key={project.vm_id}>
                  <td>
                    <strong>{teacherName}</strong>
                    <div className="df-muted">Teacher</div>
                  </td>
                  <td>{project.name}</td>
                  <td>{project.prompt_count}</td>
                  <td>{project.guidance_count}</td>
                  <td>
                    <Link
                      className="df-button secondary small"
                      href={`/${project.vm_id}${project.conversation_id ? `/${project.conversation_id}` : ""}`}
                    >
                      View project
                    </Link>
                  </td>
                </tr>
              ))}
              {shown.flatMap((student) => {
                const projects = data.projects.filter(
                  (p) => p.owner_id === student.id,
                );
                return (projects.length ? projects : [null]).map(
                  (project, index) => (
                    <tr key={`${student.id}-${project?.vm_id || "empty"}`}>
                      {index === 0 && (
                        <td rowSpan={Math.max(1, projects.length)}>
                          <div className="df-guidance-student">
                            <strong>{student.display_name}</strong>
                            <span className="df-muted">
                              @{student.username}
                            </span>
                          </div>
                        </td>
                      )}
                      <td>
                        {project?.name ||
                          (classId ? (
                            <NoClassroomProjects />
                          ) : (
                            <span className="df-muted">No projects yet</span>
                          ))}
                      </td>
                      <td>{project?.prompt_count || 0}</td>
                      <td>{project?.guidance_count || 0}</td>
                      <td>
                        {project && (
                          <div className="df-inline">
                            <Link
                              className="df-button secondary small"
                              href={`/${project.vm_id}${project.conversation_id ? `/${project.conversation_id}` : ""}`}
                            >
                              View project
                            </Link>
                            <button
                              className="df-button secondary small"
                              onClick={() => setSelection({ student, project })}
                            >
                              View safety
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ),
                );
              })}
              {!shown.length && !teachingProjects.length && (
                <tr>
                  <td colSpan={5}>
                    <TableEmptyState
                      title={
                        search
                          ? "No matching students"
                          : "No projects yet"
                      }
                      description={
                        search
                          ? "Try a different name."
                          : "When students create projects, you can explore their work here."
                      }
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </StudentReviewTable>
        </>
      )}
    </PlatformDashboardLayout>
  );
}
