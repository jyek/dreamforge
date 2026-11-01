"use client";
import { useRouter } from "next/navigation";
import { PlatformDashboardLayout } from "./platform-dashboard-layout";
import { SchoolStudents, type SchoolStudent } from "./school-students";
import { SchoolTeachers, type DirectoryTeacher } from "./school-teachers";
export function TeacherPeopleDirectory({
  section,
  name,
  schoolName,
  data,
}: {
  section: "students" | "teachers";
  name: string;
  schoolName?: string | null;
  data: {
    classes: { id: string; name: string }[];
    students: SchoolStudent[];
    teachers: DirectoryTeacher[];
  };
}) {
  const router = useRouter();
  return (
    <PlatformDashboardLayout
      teacher
      name={name}
      schoolName={schoolName}
      section={section}
      onSectionChange={(s) => router.push(`/${s}`)}
    >
      {section === "students" ? (
        <SchoolStudents students={data.students} classrooms={data.classes} />
      ) : (
        <SchoolTeachers teachers={data.teachers} classrooms={data.classes} />
      )}
    </PlatformDashboardLayout>
  );
}
