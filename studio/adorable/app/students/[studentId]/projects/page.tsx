import { redirect, notFound } from "next/navigation";
import { getProfile, canReadChild } from "@/lib/platform-auth";
import { TeacherStudentProjects } from "@/components/teacher-student-projects";
export default async function Page({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const user = await getProfile();
  if (!user) redirect("/login");
  if (user.role !== "teacher") notFound();
  const { studentId } = await params;
  if (
    !/^[a-f0-9-]{36}$/i.test(studentId) ||
    !(await canReadChild(user.id, studentId))
  )
    notFound();
  return (
    <TeacherStudentProjects
      studentId={studentId}
      teacherName={user.display_name}
    />
  );
}
