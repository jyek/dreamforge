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
type Project = {
  vm_id: string;
  group_name?: string;
  classroom_group_id?: string;
  owner_id: string;
  can_collaborate?: boolean;
  owner_name: string;
  name: string;
  conversation_id: string | null;
};
type Data = {
  myGroups?: { id: string; name: string }[];
  classroom: {
    name: string;
    teacher_name: string;
    invite_code?: string;
    teacher_id?: string;
  };
  teachers?: { id: string; display_name: string; is_owner: boolean }[];
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
  const [groupError, setGroupError] = useState("");
  const [sharing, setSharing] = useState(false);
  async function shareGroup(projectId: string, groupId: string) {
    setSharing(true);
    setGroupError("");
    try {
      const r = await fetch(`/api/platform/classes/${classId}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, groupId }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      await refresh();
    } catch (e) {
      setGroupError((e as Error).message);
    } finally {
      setSharing(false);
    }
  }
  const shown = data.projects.filter((p) => !student || p.owner_id === student);
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
      headerAction={
        <ClassProjectAssignments
          classId={classId}
          projects={data.availableProjects}
          onChanged={refresh}
        />
      }
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
      {groupError && <p role="alert">{groupError}</p>}
      {!!data.myGroups?.length && (
        <section>
          <h3>Share projects with your group</h3>
          {data.projects
            .filter((p) => p.owner_id === user.id)
            .map((p) => (
              <div className="df-school-row" key={p.vm_id}>
                <strong>{p.name}</strong>
                <span>{p.group_name || "Individual project"}</span>
                <label>
                  Group
                  <select
                    className="df-input"
                    disabled={sharing}
                    aria-label={`Share ${p.name} with your group`}
                    value={p.classroom_group_id || ""}
                    onChange={(e) => void shareGroup(p.vm_id, e.target.value)}
                  >
                    <option value="" disabled>
                      Make group project…
                    </option>
                    {data.myGroups?.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ))}
        </section>
      )}
      {preview ? (
        <>
          <ClassroomProjectPreview classId={classId} project={preview} />
        </>
      ) : (
        <>
          <section className="df-classroom-section">
            <ClassroomSectionHeader title="Students" />
            <ClassroomPeople
              people={data.students}
              role="student"
              userId={user.id}
            />
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
                  <tr key={p.vm_id}>
                    <td>
                      <strong>{p.name || "Untitled project"}</strong>
                    </td>
                    <td>{p.owner_name}</td>
                    <td>
                      {p.group_name ? (
                        <span className="df-guidance-tag">{p.group_name}</span>
                      ) : (
                        <span className="df-muted">Individual project</span>
                      )}
                    </td>
                    <td>
                      {p.owner_id === user.id || p.can_collaborate ? (
                        <Link
                          className="df-button secondary small"
                          href={`/${p.vm_id}${p.conversation_id ? `/${p.conversation_id}` : ""}`}
                        >
                          Open project
                        </Link>
                      ) : (
                        <button
                          className="df-button secondary small"
                          onClick={() => setPreview(p)}
                        >
                          View project
                        </button>
                      )}
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
