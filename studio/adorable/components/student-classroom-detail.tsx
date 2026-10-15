"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlatformDashboardLayout } from "./platform-dashboard-layout";
import {
  ClassProjectAssignments,
  type AssignableProject,
} from "./class-project-assignments";
import { TableEmptyState } from "./table-empty-state";
import { ClassroomAvatar, classroomAvatarShapes } from "./classroom-avatar";
import { SimpleLoading } from "./dream-loading";
type Project = {
  vm_id: string;
  owner_id: string;
  owner_name: string;
  name: string;
  conversation_id: string | null;
};
type Data = {
  classroom: { name: string; teacher_name: string; teacher_id?: string };
  students: { id: string; display_name: string }[];
  projects: Project[];
  availableProjects: AssignableProject[];
};
export function StudentClassroomDetail({
  classId,
  user,
  initialData,
}: {
  classId: string;
  user: { id: string; display_name: string };
  initialData: Data;
}) {
  const router = useRouter();
  const [data, setData] = useState(initialData),
    [student, setStudent] = useState(""),
    [preview, setPreview] = useState<Project | null>(null);
  async function refresh() {
    const r = await fetch(`/api/platform/classes/${classId}`);
    const d = await r.json();
    if (!r.ok) throw Error(d.error || "Could not load classroom.");
    setData(d);
  }
  const shown = data.projects.filter((p) => !student || p.owner_id === student);
  const teacherIdentity =
    data.classroom.teacher_id || data.classroom.teacher_name;
  const avatarShapes = classroomAvatarShapes([
    teacherIdentity,
    ...data.students.map((s) => s.id),
  ]);
  return (
    <PlatformDashboardLayout
      teacher={false}
      name={user.display_name}
      section="classrooms"
      onSectionChange={(s) => router.push(`/${s}`)}
      headerAction={
        <ClassProjectAssignments
          classId={classId}
          projects={data.availableProjects}
          onChanged={refresh}
        />
      }
    >
      <Link href="/classrooms" className="df-purple">
        ← Classrooms
      </Link>
      <div className="df-section-head">
        <h2>{data.classroom.name}</h2>
        <span className="df-muted">
          {data.students.length}{" "}
          {data.students.length === 1 ? "student" : "students"} ·{" "}
          {data.projects.length}{" "}
          {data.projects.length === 1 ? "project" : "projects"}
        </span>
      </div>
      <div className="df-class-teacher-person">
        <ClassroomAvatar
          identity={teacherIdentity}
          silhouette={avatarShapes[teacherIdentity]}
          role="teacher"
        />
        <div>
          <span className="df-muted">Your teacher</span>
          <strong>{data.classroom.teacher_name}</strong>
        </div>
      </div>
      {preview ? (
        <>
          <button
            className="df-button secondary small"
            onClick={() => setPreview(null)}
          >
            ← Classroom projects
          </button>
          <ClassroomProjectPreview classId={classId} project={preview} />
        </>
      ) : (
        <>
          <section className="df-class-roster">
            <h3>Students</h3>
            <div>
              {data.students.length ? (
                data.students.map((s) => (
                  <div
                    className="df-classmate"
                    key={s.id}
                    data-self={s.id === user.id}
                  >
                    <ClassroomAvatar
                      identity={s.id}
                      silhouette={avatarShapes[s.id]}
                    />
                    <strong title={s.display_name}>{s.display_name}</strong>
                    {s.id === user.id && (
                      <span className="df-classmate-you">You</span>
                    )}
                  </div>
                ))
              ) : (
                <p className="df-muted">The dream team is still gathering.</p>
              )}
            </div>
          </section>
          <div className="df-section-head">
            <h2>Classroom projects</h2>
            <label className="df-guidance-filters">
              Student
              <select
                className="df-input"
                value={student}
                onChange={(e) => setStudent(e.target.value)}
              >
                <option value="">All students</option>
                {data.students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.display_name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="df-class-project-grid">
            {shown.map((p) => (
              <article className="df-card df-class-card" key={p.vm_id}>
                <span className="df-class-project-spark" aria-hidden="true">
                  ✦
                </span>
                <h3 className="df-class-card-title">{p.name}</h3>
                <p className="df-muted">
                  By {p.owner_name}
                  {p.owner_id === user.id ? " · Your project" : ""}
                </p>
                {p.owner_id === user.id ? (
                  <Link
                    className="df-class-card-link"
                    href={`/${p.vm_id}${p.conversation_id ? `/${p.conversation_id}` : ""}`}
                  >
                    Open project →
                  </Link>
                ) : (
                  <button
                    className="df-class-card-link"
                    onClick={() => setPreview(p)}
                  >
                    View project →
                  </button>
                )}
              </article>
            ))}
          </div>
          {!shown.length && (
            <div className="df-card df-class-empty">
              <TableEmptyState
                title="A classroom full of possibilities"
                description={
                  student
                    ? "This student hasn’t assigned any projects here yet."
                    : "Assign a project to this classroom and let your ideas inspire your classmates."
                }
                action={
                  student ? (
                    <button
                      className="df-button secondary small"
                      onClick={() => setStudent("")}
                    >
                      Show all students
                    </button>
                  ) : undefined
                }
              />
            </div>
          )}
        </>
      )}
    </PlatformDashboardLayout>
  );
}
function ClassroomProjectPreview({
  classId,
  project,
}: {
  classId: string;
  project: Project;
}) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    async function load() {
      try {
        const r = await fetch(
          `/api/platform/classes/${classId}/projects/${project.vm_id}/preview`,
          { method: "POST", signal: controller.signal },
        );
        const d = await r.json();
        if (!r.ok) throw Error(d.error || "Preview unavailable.");
        if (r.status === 202 && ++attempts < 30) {
          timer = setTimeout(load, 2000);
          return;
        }
        if (!d.url)
          throw Error(
            "The preview is taking longer than expected. Please try again.",
          );
        setUrl(d.url);
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      }
    }
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [classId, project.vm_id]);
  return (
    <section className="df-class-preview">
      <h3>
        {project.name}{" "}
        <span className="df-muted">· By {project.owner_name} · View only</span>
      </h3>
      {error ? (
        <p role="alert" className="df-error">
          {error}
        </p>
      ) : url ? (
        <iframe
          src={url}
          title={`${project.name} preview`}
          referrerPolicy="no-referrer"
        />
      ) : (
        <SimpleLoading label="Opening project preview…" />
      )}
    </section>
  );
}
