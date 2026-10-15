import {
  TeacherStudentProjects,
  type StudentProjectsData,
} from "./teacher-student-projects";
export function TeacherClassroomDetail({
  classId,
  teacherName,
  initialData,
}: {
  classId: string;
  teacherName: string;
  initialData?: StudentProjectsData;
}) {
  return (
    <TeacherStudentProjects
      classId={classId}
      teacherName={teacherName}
      initialData={initialData}
    />
  );
}
