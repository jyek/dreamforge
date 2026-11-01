"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ClassroomSectionHeader } from "./classroom-section-header";
import { ClassCode } from "./class-code";
import { DashboardDetailHeader } from "./dashboard-detail-header";
import {
  schoolSectionPath,
  PlatformDashboardLayout,
} from "./platform-dashboard-layout";
import { ClassroomGroups } from "./classroom-groups";
import { AddPersonDialog } from "./people-toolbar";
import { ClassroomPeople } from "./classroom-people";
import type { StudentProjectsData } from "./teacher-student-projects";
export function TeacherClassroomDetail({
  classId,
  teacherName,
  initialData,
  schoolMode = false,
  schoolName,
}: {
  classId: string;
  teacherName: string;
  initialData?: StudentProjectsData;
  schoolMode?: boolean;
  schoolName?: string | null;
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
      schoolMode={schoolMode}
      schoolName={schoolName}
      name={teacherName}
      section={schoolMode ? "classes" : "classrooms"}
      onSectionChange={(s) =>
        router.push(schoolMode ? schoolSectionPath(s) : `/${s}`)
      }
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
        <ClassroomSectionHeader
          title="Teachers"
          action={
            <AddPersonDialog
              role="teacher"
              classroom={{
                id: classId,
                name: data?.classroom?.name || "Classroom",
              }}
              onChanged={refresh}
            />
          }
        />
        <ClassroomPeople
          people={data?.teachers || []}
          role="teacher"
          loading={!data && !error}
        />
      </section>
      <ClassroomGroups
        classId={classId}
        availableProjects={data?.availableProjects || []}
        onProjectsChanged={refresh}
      />
    </PlatformDashboardLayout>
  );
}
