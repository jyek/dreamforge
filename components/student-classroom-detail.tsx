"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClassroomSectionHeader } from "./classroom-section-header";
import { ClassCode } from "./class-code";
import { DashboardDetailHeader } from "./dashboard-detail-header";
import { PlatformDashboardLayout } from "./platform-dashboard-layout";
import {
  ClassProjectAssignments,
  type AssignableProject,
} from "./class-project-assignments";
import { ClassroomPeople } from "./classroom-people";
import { ClassroomProjectFilter } from "./classroom-project-filter";
import { StudentReviewTable } from "./student-review-table";
import { SimpleLoading } from "./dream-loading";
import { StudentProjectActions } from "./student-project-actions";
type Project = {
  vm_id: string;
  group_name?: string;
  is_group_project?: boolean;
  classroom_group_id?: string;
  owner_id: string;
  can_collaborate?: boolean;
  owner_name: string;
  name: string;
  description?: string | null;
  conversation_id: string | null;
};
type Data = {
  groups?: { id: string; name: string }[];
  myGroups?: { id: string; name: string }[];
  classroom: {
    name: string;
    teacher_name: string;
    invite_code?: string;
    teacher_id?: string;
  };
  teachers?: { id: string; display_name: string; is_owner: boolean }[];
  students: { id: string; display_name: string; group_id?: string | null }[];
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
  function openProject(project: Project) {
    if (project.owner_id === user.id || project.can_collaborate) {
      router.push(
        `/${project.vm_id}${project.conversation_id ? `/${project.conversation_id}` : ""}`,
      );
    } else {
      setPreview(project);
    }
  }
  const teachers = data.teachers || [
    {
      id: data.classroom.teacher_id || data.classroom.teacher_name,
      display_name: data.classroom.teacher_name,
      is_owner: true,
    },
  ];
  return (
    <PlatformDashboardLayout
      teacher={false}
      name={user.display_name}
      section="classrooms"
      onSectionChange={(s) => router.push(`/${s}`)}
    >
      <DashboardDetailHeader
        title={preview ? preview.name : data.classroom.name}
        subtitle={<ClassCode code={data.classroom.invite_code} />}
        back={
          preview ? (
            <button
              className="df-button secondary small"
              onClick={() => setPreview(null)}
            >
              ← Classroom
            </button>
          ) : (
            <Link className="df-button secondary small" href="/classrooms">
              ← Classrooms
            </Link>
          )
        }
      />
      <section className="df-classroom-section">
        <ClassroomSectionHeader title="Teachers" />
        <ClassroomPeople people={teachers} role="teacher" />
      </section>
      {preview ? (
        <>
          <ClassroomProjectPreview classId={classId} project={preview} />
        </>
      ) : (
        <>
          <section className="df-classroom-section">
            <ClassroomSectionHeader title="Students" />
            {data.groups?.length ? (
              <div className="df-student-classroom-groups">
                {!!data.students.some((s) => !s.group_id) && (
                  <ClassroomPeople
                    people={data.students.filter((s) => !s.group_id)}
                    role="student"
                    userId={user.id}
                  />
                )}
                <div className="df-group-grid">
                  {data.groups.map((group) => {
                    const members = data.students.filter(
                      (s) => s.group_id === group.id,
                    );
                    return (
                      <article
                        className="df-group-card"
                        key={group.id}
                        aria-label={`${group.name} group`}
                      >
                        <div className="df-group-card-header">
                          <div className="df-group-card-heading">
                            <h3>{group.name}</h3>
                            <small className="df-muted">
                              {members.length}{" "}
                              {members.length === 1 ? "student" : "students"}
                            </small>
                          </div>
                          {members.some((s) => s.id === user.id) && (
                            <span className="df-classmate-you">Your group</span>
                          )}
                        </div>
                        {members.length ? (
                          <ClassroomPeople
                            people={members}
                            role="student"
                            userId={user.id}
                          />
                        ) : (
                          <p className="df-muted">No students yet.</p>
                        )}
                      </article>
                    );
                  })}
                </div>
              </div>
            ) : (
              <ClassroomPeople
                people={data.students}
                role="student"
                userId={user.id}
              />
            )}
          </section>
          <section className="df-classroom-section">
            <ClassroomSectionHeader title="Projects" />
            <ClassroomProjectFilter
              people={[
                ...teachers.map((t) => ({
                  id: t.id,
                  name: t.display_name,
                  role: "teacher" as const,
                })),
                ...data.students.map((t) => ({
                  id: t.id,
                  name: t.display_name,
                  role: "student" as const,
                })),
              ]}
              value={student}
              onChange={setStudent}
              action={
                <ClassProjectAssignments
                  classId={classId}
                  projects={data.availableProjects}
                  onChanged={refresh}
                />
              }
            />
            <StudentReviewTable
              columns={4}
              compact={false}
              empty={!shown.length}
            >
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Created by</th>
                  <th>Group</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr
                    key={p.vm_id}
                    className="df-clickable-row"
                    tabIndex={0}
                    aria-label={`Open ${p.name || "Untitled project"}`}
                    onClick={() => openProject(p)}
                    onKeyDown={(e) => {
                      if (
                        e.target === e.currentTarget &&
                        (e.key === "Enter" || e.key === " ")
                      ) {
                        e.preventDefault();
                        openProject(p);
                      }
                    }}
                  >
                    <td>
                      <strong>{p.name || "Untitled project"}</strong>
                    </td>
                    <td>{p.owner_name}</td>
                    <td>
                      {p.group_name ? (
                        <span className="df-guidance-tag">{p.group_name}</span>
                      ) : (
                        <span className="df-muted">
                          {p.is_group_project
                            ? "Group project · Unassigned"
                            : "Individual project"}
                        </span>
                      )}
                    </td>
                    <td
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <div className="df-classroom-project-row-actions">
                        {p.owner_id === user.id && (
                          <StudentProjectActions
                            projectId={p.vm_id}
                            name={p.name || "Untitled project"}
                            description={p.description || ""}
                            classId={classId}
                            withinTable
                            canMakeGroup={
                              !!data.myGroups?.length &&
                              !data.myGroups.some(
                                (g) => g.id === p.classroom_group_id,
                              )
                            }
                            onChanged={refresh}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!shown.length && (
                  <tr>
                    <td colSpan={4}>
                      {student
                        ? "No projects assigned by this person."
                        : "No projects assigned to this classroom yet."}
                    </td>
                  </tr>
                )}
              </tbody>
            </StudentReviewTable>
          </section>
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
