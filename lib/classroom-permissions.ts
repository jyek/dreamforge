/** SQL fragments accept trusted column expressions only; user values stay bound. */
export const classroomTeacherSQL = (classId: string, teacherId = "$1") =>
  `exists(select 1 from classes _ct where _ct.id=${classId} and (_ct.teacher_id=${teacherId} or exists(select 1 from class_teachers _team where _team.class_id=_ct.id and _team.teacher_id=${teacherId})))`;
export const teacherStudentAccessSQL = (childId: string, teacherId = "$1") =>
  `exists(select 1 from class_members _m where _m.child_id=${childId} and ${classroomTeacherSQL("_m.class_id", teacherId)})`;
export const sharedTeachingProjectSQL = (
  vmId: string,
  ownerId: string,
  teacherId = "$1",
) =>
  `exists(select 1 from class_projects _cp where _cp.vm_id=${vmId} and ${classroomTeacherSQL("_cp.class_id", ownerId)} and ${classroomTeacherSQL("_cp.class_id", teacherId)})`;

/** Read-only safety visibility for administrators of the student's school. */
export const schoolStudentSafetyAccessSQL = (childId: string, actorId = "$1") =>
  `exists(select 1 from profiles _student join school_admins _admin on _admin.school_id=_student.school_id where _student.id=${childId} and _student.role='child' and _admin.profile_id=${actorId})`;

/** Read-only visibility into a student's work for classroom teachers and their school admins. */
export const studentReadAccessSQL = (childId: string, actorId = "$1") =>
  `(${teacherStudentAccessSQL(childId, actorId)} or ${schoolStudentSafetyAccessSQL(childId, actorId)})`;
