import { notFound, redirect } from "next/navigation";
import { getProfile, platformEnabled } from "@/lib/platform-auth";
import { database } from "@/lib/database";
import { StudentClassProjects } from "@/components/student-class-projects";
import { TeacherClassroomDetail } from "@/components/teacher-classroom-detail";
export default async function Page({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const user = platformEnabled() ? await getProfile() : null;
  if (!user) redirect("/login");
  const { classId } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(classId)) notFound();
  if (user.role === "child") {
    const { rows: classes } = await database().query(
      "select c.name from adorable.classes c join adorable.class_members m on m.class_id=c.id where c.id=$1 and m.child_id=$2",
      [classId, user.id],
    );
    if (!classes.length) notFound();
    const { rows: projects } = await database().query(
      "select p.vm_id,p.metadata from adorable.projects p join adorable.project_classrooms pc on pc.vm_id=p.vm_id join adorable.classes c on c.id=pc.class_id where c.id=$1 and p.owner_id=c.teacher_id and not p.is_example order by p.updated_at desc",
      [classId],
    );
    return (
      <StudentClassProjects
        name={user.display_name}
        className={classes[0].name}
        projects={projects}
      />
    );
  }
  const { rows } = await database().query(
    "select id from adorable.classes where id=$1 and teacher_id=$2",
    [classId, user.id],
  );
  if (!rows.length) notFound();
  return (
    <TeacherClassroomDetail classId={classId} teacherName={user.display_name} />
  );
}
