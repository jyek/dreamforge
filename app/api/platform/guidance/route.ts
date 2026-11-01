import {
  teacherStudentAccessSQL,
  schoolStudentSafetyAccessSQL,
  classroomTeacherSQL,
} from "@/lib/classroom-permissions";
import { administeredSchool } from "@/lib/schools";
import { database } from "@/lib/database";
import { getProfile, platformEnabled } from "@/lib/platform-auth";
import { approvalClassroomsSQL } from "@/lib/prompt-hold";
import { guidanceSQL } from "@/lib/prompt-guidance";
export async function GET(req: Request) {
  const user = platformEnabled() ? await getProfile() : null;
  if (user?.role !== "teacher")
    return Response.json(
      { error: "Teacher access required." },
      { status: 403 },
    );
  const params = new URL(req.url).searchParams;
  const schoolScope = params.get("scope") === "school";
  if (schoolScope && !(await administeredSchool(database(), user.id)))
    return Response.json(
      { error: "School Admin access required." },
      { status: 403 },
    );
  const studentAccess = schoolScope
    ? schoolStudentSafetyAccessSQL
    : teacherStudentAccessSQL;
  const classId = params.get("classId") || null;
  if (classId && !/^[a-f0-9-]{36}$/i.test(classId))
    return Response.json({ error: "Invalid classroom." }, { status: 400 });
  const classrooms = (
    await database().query(
      `select c.id,c.name from classes c join profiles owner on owner.id=c.teacher_id where ${schoolScope ? "exists(select 1 from school_admins a where a.school_id=c.school_id and a.profile_id=$1)" : classroomTeacherSQL("c.id")} order by lower(c.name)`,
      [user.id],
    )
  ).rows;
  if (classId && !classrooms.some((c) => c.id === classId))
    return Response.json({ error: "Classroom not found." }, { status: 404 });
  const inClass = (child: string, param: string) =>
    `(${param}::uuid is null or exists(select 1 from class_members filter_member where filter_member.child_id=${child} and filter_member.class_id=${param}))`;
  const studentId = params.get("studentId");
  const scoped = (
    classParam: string,
  ) => `with prompts as (select r.id,r.child_id,r.vm_id,r.conversation_id,r.content,r.decision,r.hold_status,r.reviewed_at,reviewer.display_name as reviewer_name,r.created_at,p.metadata->>'name' as project_name,${approvalClassroomsSQL("r.child_id", "$1", classParam)} as approval_classrooms,${guidanceSQL} as guidance
    from prompt_reviews r left join projects p on p.vm_id=r.vm_id left join profiles reviewer on reviewer.id=r.reviewed_by
    where ${studentAccess("r.child_id")} and ${inClass("r.child_id", classParam)})`;
  if (!studentId) {
    const { rows } = await database().query(
      `${scoped("$2")}
      select pr.id,pr.display_name,pr.username,
      (select count(*)::int from projects p where p.owner_id=pr.id and not p.is_example) as project_count,
      (select count(*)::int from prompts r where r.child_id=pr.id) as prompt_count,
      (select count(*)::int from prompts r where r.child_id=pr.id and cardinality(r.guidance)>0) as guidance_count,
      (select count(*)::int from prompts r where r.child_id=pr.id and (r.decision<>'allow' or r.hold_status is not null)) as alert_count,
      (select count(*)::int from prompts r where r.child_id=pr.id and r.hold_status='pending') as pending_count,
      coalesce((select jsonb_object_agg(category,n) from (select category,count(*)::int as n from prompts r cross join lateral unnest(r.guidance) category where r.child_id=pr.id group by category) counts),'{}'::jsonb) as categories
      from profiles pr where ${studentAccess("pr.id")} and ${inClass("pr.id", "$2")} order by lower(pr.display_name),pr.id`,
      [user.id, classId],
    );
    return Response.json({ students: rows, classrooms });
  }
  if (!/^[a-f0-9-]{36}$/i.test(studentId))
    return Response.json({ error: "Invalid student." }, { status: 400 });
  const category = params.get("category") || "";
  const project = params.get("projectId") || "";
  const search = (params.get("search") || "").slice(0, 200);
  const offset = Number(params.get("offset") || 0);
  if (!Number.isSafeInteger(offset) || offset < 0)
    return Response.json({ error: "Invalid page." }, { status: 400 });
  const db = database();
  const { rows: students } = await db.query(
    `select pr.id,pr.display_name from profiles pr where pr.id=$2 and ${studentAccess("pr.id")} and ${inClass("pr.id", "$3")}`,
    [user.id, studentId, classId],
  );
  if (!students.length)
    return Response.json({ error: "Student not found." }, { status: 404 });
  const { rows: projects } = await db.query(
    `select vm_id,metadata->>'name' as name from projects where owner_id=$1 and not is_example order by updated_at desc`,
    [studentId],
  );
  const { rows } = await db.query(
    `${scoped("$7")} select * from prompts r where r.child_id=$2 and ($3='' or ($3='alerts' and (r.decision<>'allow' or r.hold_status is not null)) or ($3='any' and cardinality(r.guidance)>0) or $3=any(r.guidance)) and ($4='' or r.vm_id=$4) and ($5='' or strpos(lower(r.content),lower($5))>0) order by r.created_at desc,r.id desc limit 51 offset $6`,
    [user.id, studentId, category, project, search, offset, classId],
  );
  return Response.json({
    classrooms,
    student: students[0],
    projects,
    prompts: rows.slice(0, 50),
    hasMore: rows.length > 50,
  });
}
