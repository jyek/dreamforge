"use client";
import { DreamLoading } from "./dream-loading";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
};
type Data = {
  classroom: { name: string };
  students: GuidanceStudent[];
  projects: Project[];
};
export function TeacherClassroomDetail({
  classId,
  teacherName,
}: {
  classId: string;
  teacherName: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [selection, setSelection] = useState<{
      student: GuidanceStudent;
      project: Project;
    } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/platform/classes/${classId}`, { signal: controller.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error || "Could not load classroom.");
        setData(d);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [classId]);
  const shown =
    data?.students.filter((s) =>
      `${s.display_name} ${s.username}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) || [];
  return (
    <PlatformDashboardLayout
      teacher
      name={teacherName}
      section="classrooms"
      onSectionChange={(s) => router.push(`/${s}`)}
    >
      <Link className="df-purple" href="/classrooms">
        ← Classrooms
      </Link>
      <div className="df-section-head">
        <h2>{data?.classroom.name || "Classroom"}</h2>
        {data && (
          <span className="df-muted">
            {data.students.length} students · {data.projects.length} projects
          </span>
        )}
      </div>
      <p className="df-muted">
        Explore student projects and the prompts behind them. Student workspaces
        are read-only for teachers.
      </p>
      {error ? (
        <p role="alert" className="df-error">
          {error}
        </p>
      ) : !data ? (
        <DreamLoading label="Loading classroom…" />
      ) : selection ? (
        <>
          <button
            className="df-button secondary small"
            onClick={() => setSelection(null)}
          >
            ← Classroom projects
          </button>
          <TeacherPromptGuidance
            key={selection.project.vm_id}
            initialStudent={selection.student}
            initialProjectId={selection.project.vm_id}
          />
        </>
      ) : (
        <>
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
          <div className="df-card df-guidance-table">
            <table className="df-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Projects</th>
                  <th>Project</th>
                  <th>Prompts</th>
                  <th>Explore</th>
                </tr>
              </thead>
              <tbody>
                {shown.flatMap((student) => {
                  const projects = data.projects.filter(
                    (p) => p.owner_id === student.id,
                  );
                  return (projects.length ? projects : [null]).map(
                    (project, index) => (
                      <tr key={`${student.id}-${project?.vm_id || "empty"}`}>
                        {index === 0 && (
                          <>
                            <td rowSpan={Math.max(1, projects.length)}>
                              <strong>{student.display_name}</strong>
                              <div className="df-muted">
                                @{student.username}
                              </div>
                            </td>
                            <td rowSpan={Math.max(1, projects.length)}>
                              {projects.length}
                            </td>
                          </>
                        )}
                        <td>
                          {project ? (
                            <Link
                              className="df-purple"
                              href={`/${project.vm_id}${project.conversation_id ? `/${project.conversation_id}` : ""}`}
                            >
                              {project.name} ↗
                            </Link>
                          ) : (
                            <span className="df-muted">No projects yet</span>
                          )}
                        </td>
                        <td>{project?.prompt_count || 0}</td>
                        <td>
                          {project && (
                            <div className="df-inline">
                              <Link
                                className="df-button secondary small"
                                href={`/${project.vm_id}${project.conversation_id ? `/${project.conversation_id}` : ""}`}
                              >
                                View project ↗
                              </Link>
                              <button
                                className="df-button secondary small"
                                onClick={() =>
                                  setSelection({ student, project })
                                }
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
                {!shown.length && (
                  <tr>
                    <td colSpan={5}>
                      {data.students.length
                        ? "No students match your search."
                        : "No students have joined this classroom yet."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </PlatformDashboardLayout>
  );
}
