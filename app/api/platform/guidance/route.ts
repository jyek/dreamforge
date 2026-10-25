import { teacherStudentAccessSQL } from "@/lib/classroom-permissions";
import { database } from "@/lib/database";
import { getProfile, platformEnabled } from "@/lib/platform-auth";
import { guidanceSQL } from "@/lib/prompt-guidance";
export async function GET(req: Request) {
  const user = platformEnabled() ? await getProfile() : null;
  if (user?.role !== "teacher")
    return Response.json(
      { error: "Teacher access required." },
      { status: 403 },
    );
  const params = new URL(req.url).searchParams;
  const studentId = params.get("studentId");
  const scoped = `with prompts as (select r.id,r.child_id,r.vm_id,r.conversation_id,r.content,r.decision,r.created_at,p.metadata->>'name' as project_name,${guidanceSQL} as guidance
    from adorable.prompt_reviews r join adorable.projects p on p.vm_id=r.vm_id
    where ${teacherStudentAccessSQL("r.child_id")})`;
  if (!studentId) {
    const { rows } = await database().query(
      `${scoped}
      select pr.id,pr.display_name,pr.username,
      (select count(*)::int from adorable.projects p where p.owner_id=pr.id and not p.is_example) as project_count,
      (select count(*)::int from prompts r where r.child_id=pr.id) as prompt_count,
      (select count(*)::int from prompts r where r.child_id=pr.id and cardinality(r.guidance)>0) as guidance_count,
      coalesce((select jsonb_object_agg(category,n) from (select category,count(*)::int as n from prompts r cross join lateral unnest(r.guidance) category where r.child_id=pr.id group by category) counts),'{}'::jsonb) as categories
      from adorable.profiles pr where ${teacherStudentAccessSQL("pr.id")} order by lower(pr.display_name),pr.id`,
      [user.id],
    );
    return Response.json({ students: rows });
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
    `select pr.id,pr.display_name from adorable.profiles pr where pr.id=$2 and ${teacherStudentAccessSQL("pr.id")}`,
    [user.id, studentId],
  );
  if (!students.length)
    return Response.json({ error: "Student not found." }, { status: 404 });
  const { rows: projects } = await db.query(
    `select vm_id,metadata->>'name' as name from adorable.projects where owner_id=$1 and not is_example order by updated_at desc`,
    [studentId],
  );
  const { rows } = await db.query(
    `${scoped} select * from prompts r where r.child_id=$2 and ($3='' or ($3='any' and cardinality(r.guidance)>0) or $3=any(r.guidance)) and ($4='' or r.vm_id=$4) and ($5='' or strpos(lower(r.content),lower($5))>0) order by r.created_at desc,r.id desc limit 51 offset $6`,
    [user.id, studentId, category, project, search, offset],
  );
  return Response.json({
    student: students[0],
    projects,
    prompts: rows.slice(0, 50),
    hasMore: rows.length > 50,
  });
}
