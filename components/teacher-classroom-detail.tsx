"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ClassCode } from "./class-code";
import { DashboardDetailHeader } from "./dashboard-detail-header";
import { PlatformDashboardLayout } from "./platform-dashboard-layout";
import { ClassroomSafetyReport } from "./classroom-safety-report";
import { ClassProjectAssignments } from "./class-project-assignments";
import { ClassroomGroups } from "./classroom-groups";
import { ClassroomTeachersDialog } from "./classroom-teachers-dialog";
import { ClassroomPeople } from "./classroom-people";
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
      <DashboardDetailHeader
        title={data?.classroom?.name || "Classroom"}
        subtitle={<ClassCode code={data?.classroom?.invite_code} />}
        back={
          <a className="df-button secondary small" href="/classrooms">
            ← Classrooms
          </a>
        }
      />
      {error && <p role="alert">{error}</p>}
      <section className="df-class-teaching-team">
        <div className="df-section-head">
          <h3>Teachers</h3>
          <ClassroomTeachersDialog classId={classId} onChanged={refresh} />
        </div>
        <ClassroomPeople people={data?.teachers || []} role="teacher" />
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
