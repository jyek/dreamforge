import { notFound, redirect } from "next/navigation";
import { getProfile, platformEnabled } from "@/lib/platform-auth";
import { classroomData } from "@/lib/classroom-data";
import { TeacherClassroomDetail } from "@/components/teacher-classroom-detail";
import { StudentClassroomDetail } from "@/components/student-classroom-detail";
export default async function Page({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const user = platformEnabled() ? await getProfile() : null;
  if (!user) redirect("/login");
  const { classId } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(classId)) notFound();
  const data = await classroomData(classId, user);
  if (!data) notFound();
  return user.role === "teacher" ? (
    <TeacherClassroomDetail
      classId={classId}
      teacherName={user.display_name}
      initialData={data}
    />
  ) : (
    <StudentClassroomDetail classId={classId} user={user} initialData={data} />
  );
}
