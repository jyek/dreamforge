/** SQL fragments accept trusted column expressions only; user values stay bound. */
export const classroomTeacherSQL = (classId: string, teacherId = "$1") =>
  `exists(select 1 from adorable.classes _ct where _ct.id=${classId} and (_ct.teacher_id=${teacherId} or exists(select 1 from adorable.class_teachers _team where _team.class_id=_ct.id and _team.teacher_id=${teacherId})))`;
export const teacherStudentAccessSQL = (childId: string, teacherId = "$1") =>
  `(exists(select 1 from adorable.teacher_builders _b where _b.child_id=${childId} and _b.teacher_id=${teacherId}) or exists(select 1 from adorable.class_members _m where _m.child_id=${childId} and ${classroomTeacherSQL("_m.class_id", teacherId)}))`;
export const sharedTeachingProjectSQL = (
  vmId: string,
  ownerId: string,
  teacherId = "$1",
) =>
  `exists(select 1 from adorable.class_projects _cp where _cp.vm_id=${vmId} and ${classroomTeacherSQL("_cp.class_id", ownerId)} and ${classroomTeacherSQL("_cp.class_id", teacherId)})`;
