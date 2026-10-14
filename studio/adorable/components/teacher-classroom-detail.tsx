import { TeacherStudentProjects } from "./teacher-student-projects";
export function TeacherClassroomDetail({
  classId,
  teacherName,
}: {
  classId: string;
  teacherName: string;
}) {
  return <TeacherStudentProjects classId={classId} teacherName={teacherName} />;
}
