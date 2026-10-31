import { database } from "@/lib/database";
import { getProfile, platformEnabled } from "@/lib/platform-auth";
import { groupManagerSQL } from "@/lib/project-group";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ classId: string }> },
) {
  const user = platformEnabled() ? await getProfile() : null;
  if (!user || user.role !== "teacher")
    return Response.json({ error: "Staff access required." }, { status: 403 });
  const { classId } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(classId))
    return Response.json({ error: "Invalid classroom." }, { status: 400 });
  const db = database();
  const authorized = await db.query(
    `select 1 from classes c where c.id=$1 and ${groupManagerSQL("c.id", "$2")}`,
    [classId, user.id],
  );
  if (!authorized.rowCount)
    return Response.json({ error: "Classroom not found." }, { status: 404 });
  const { rows } = await db.query(
    `select p.vm_id as id,p.metadata->>'name' as name,pr.display_name as owner from projects p join profiles pr on pr.id=p.owner_id join class_members m on m.child_id=pr.id
    where m.class_id=$1 and pr.role='child' and not p.is_example and (p.group_class_id is null or p.group_class_id=$1) order by p.updated_at desc`,
    [classId],
  );
  return Response.json(
    { projects: rows },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
