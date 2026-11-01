"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PlatformDashboardLayout } from "./platform-dashboard-layout";
import { ClassroomSafetyReport } from "./classroom-safety-report";
import { ClassProjectAssignments } from "./class-project-assignments";
import { ClassroomGroups } from "./classroom-groups";
import { ClassroomTeachersDialog } from "./classroom-teachers-dialog";
import { ClassroomAvatar } from "./classroom-avatar";
import type { StudentProjectsData } from "./teacher-student-projects";
export function TeacherClassroomDetail({
  classId,
  teacherName,
  initialData,
}: {
  classId: string;
  teacherName: string;
  initialData?: StudentProjectsData;
}) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [error, setError] = useState("");
  async function refresh() {
    const r = await fetch(`/api/platform/classes/${classId}`);
    const d = await r.json();
    if (!r.ok) throw Error(d.error);
    setData(d);
  }
  useEffect(() => {
    if (!initialData) void refresh().catch((e) => setError(e.message));
  }, [classId]);
  return (
    <PlatformDashboardLayout
      teacher
      name={teacherName}
      section="classrooms"
      onSectionChange={(s) => router.push(`/${s}`)}
    >
      <a className="df-purple" href="/classrooms">
        ← Classrooms
      </a>
      <div className="df-section-head">
        <h2>{data?.classroom?.name || "Classroom"}</h2>
        <ClassroomTeachersDialog classId={classId} onChanged={refresh} />
      </div>
      {error && <p role="alert">{error}</p>}
      <section className="df-class-teaching-team">
        <h3>Teaching team</h3>
        <div>
          {data?.teachers?.map((t) => (
            <div className="df-class-teacher-person" key={t.id}>
              <ClassroomAvatar identity={t.id} role="teacher" />
              <div>
                <strong>{t.display_name}</strong>
                <span className="df-muted">
                  {t.is_owner ? "Lead teacher" : "Co-teacher"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
      <ClassProjectAssignments
        classId={classId}
        projects={data?.availableProjects || []}
        onChanged={refresh}
      />
      <ClassroomGroups classId={classId} />
      <ClassroomSafetyReport classId={classId} />
    </PlatformDashboardLayout>
  );
}
