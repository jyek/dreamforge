import { database } from "./database";
import { getStudentSession } from "./student-session";
export async function projectAccess(vmId: string, readOnly = false) {
  const user = await getStudentSession();
  if (!user) return null;
  const { rows } = await database().query(`select p.*,h.vm_id,c.owner_id as teacher_id,
    coalesce(s.ai_enabled,true) as ai_enabled,s.access_start,s.access_end,
    coalesce(s.daily_token_limit,200000) as daily_token_limit,
    exists(select 1 from students st where st.user_id=p.owner_id and st.classroom_id=p.classroom_id) as enrolled
    from harness_projects h join projects p on p.id=h.project_id
    left join classrooms c on c.id=p.classroom_id left join classroom_harness_settings s on s.classroom_id=p.classroom_id
    where h.vm_id=$1 and (p.owner_id=$2 or ($3 and c.owner_id=$2))`, [vmId,user.id,readOnly]);
  const row = rows[0];
  if (!row) return null;
  const teacher = row.teacher_id === user.id;
  if (!teacher && (!row.enrolled || !row.ai_enabled || (row.access_start && new Date(row.access_start)>new Date()) || (row.access_end && new Date(row.access_end)<new Date()))) return null;
  return { user, project: row, teacher, readOnly: row.owner_id !== user.id };
}
