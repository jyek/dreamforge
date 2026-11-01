import { database } from "@/lib/database";
import { getProfile, platformEnabled } from "@/lib/platform-auth";
import { classroomTeacherSQL } from "@/lib/classroom-permissions";
export async function GET() {
  const user = platformEnabled() ? await getProfile() : null;
  if (user?.role !== "teacher")
    return Response.json(
      { error: "Teacher access required." },
      { status: 403 },
    );
  const { rows } = await database().query(
    `select c.id,c.name,
 count(distinct r.id) filter(where r.hold_status='pending')::int as waiting,
 count(distinct r.id) filter(where r.decision<>'allow' and r.reviewed_at is null and r.hold_status is distinct from 'pending')::int as unreviewed
 from classes c left join class_members m on m.class_id=c.id
 left join prompt_reviews r on r.child_id=m.child_id
 where ${classroomTeacherSQL("c.id")}
 group by c.id,c.name order by count(distinct r.id) filter(where r.hold_status='pending') desc,c.name`,
    [user.id],
  );
  return Response.json({ classes: rows });
}
