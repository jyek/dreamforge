import { notFound, redirect } from "next/navigation";
import { getProfile, platformEnabled } from "@/lib/platform-auth";
import { database } from "@/lib/database";
import { TeacherClassroomDetail } from "@/components/teacher-classroom-detail";
export default async function Page({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const user = platformEnabled() ? await getProfile() : null;
  if (!user) redirect("/login");
  if (user.role !== "teacher") redirect("/classrooms");
  const { classId } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(classId)) notFound();
  const { rows } = await database().query(
    "select id from adorable.classes where id=$1 and teacher_id=$2",
    [classId, user.id],
  );
  if (!rows.length) notFound();
  return (
    <TeacherClassroomDetail classId={classId} teacherName={user.display_name} />
  );
}
