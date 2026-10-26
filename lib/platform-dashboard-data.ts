import {
  classroomTeacherSQL,
  teacherStudentAccessSQL,
} from "./classroom-permissions";
import { paymentsEnabled } from "./topup-packages";
import { database } from "./database";
import type { Profile } from "./platform-auth";
export async function loadDashboardData(user: Profile, section?: string) {
  const db = database();
  const { rows: classes } = await db.query(
    user.role === "teacher"
      ? `select c.id,c.name,c.invite_code,(c.teacher_id=$1) as can_manage from classes c where ${classroomTeacherSQL("c.id")} order by c.created_at`
      : "select c.id,c.name,pr.display_name as teacher_name from classes c join profiles pr on pr.id=c.teacher_id join class_members m on m.class_id=c.id where m.child_id=$1 order by c.created_at",
    [user.id],
  );
  if (section === "classrooms") {
    const { rows: wallet } =
      user.role === "child"
        ? await db.query(
            "select token_limit,used_tokens,reserved_tokens,input_tokens,output_tokens from token_accounts where child_id=$1",
            [user.id],
          )
        : { rows: [] };
    return {
      user,
      classes,
      projects: [],
      children: [],
      wallet: wallet[0] || null,
      unconfirmed: [],
      projectUsage: [],
      paymentsEnabled: paymentsEnabled(),
    };
  }
  const { rows: projects } = await db.query(
    `select p.vm_id,p.metadata,pr.display_name as child_name from projects p join profiles pr on pr.id=p.owner_id where not p.is_example and (p.owner_id=$1) order by p.updated_at desc`,
    [user.id],
  );
  const { rows: children } =
    user.role === "teacher"
      ? await db.query(
          `select distinct pr.id,pr.display_name,pr.username,a.token_limit,a.used_tokens,a.reserved_tokens,a.input_tokens,a.output_tokens,a.estimated_cost_usd from profiles pr left join token_accounts a on a.child_id=pr.id where ${teacherStudentAccessSQL("pr.id")}`,
          [user.id],
        )
      : { rows: [] };
  const { rows: wallet } =
    user.role === "child"
      ? await db.query(
          "select token_limit,used_tokens,reserved_tokens,input_tokens,output_tokens,estimated_cost_usd from token_accounts where child_id=$1",
          [user.id],
        )
      : { rows: [] };
  const { rows: unconfirmed } =
    user.role === "teacher"
      ? await db.query(
          `select r.id,r.reserved_tokens,pr.display_name from usage_runs r join profiles pr on pr.id=r.child_id where r.state='uncertain' and ${teacherStudentAccessSQL("r.child_id")}`,
          [user.id],
        )
      : await db.query(
          "select id,reserved_tokens from usage_runs where child_id=$1 and state='uncertain'",
          [user.id],
        );
  const { rows: projectUsage } =
    user.role === "child"
      ? await db.query(
          `select p.vm_id,p.metadata->>'name' as project_name,
    coalesce(sum(case when r.state='settled' then coalesce(r.input_tokens,0)+coalesce(r.output_tokens,0) else 0 end),0)::text as used_tokens,
    coalesce(sum(case when r.state='settled' then r.input_tokens else 0 end),0)::text as input_tokens,
    coalesce(sum(case when r.state='settled' then r.output_tokens else 0 end),0)::text as output_tokens
    from projects p left join usage_runs r on r.vm_id=p.vm_id and r.child_id=$1
    where p.owner_id=$1 and not p.is_example group by p.vm_id,p.metadata,p.updated_at order by p.updated_at desc`,
          [user.id],
        )
      : { rows: [] };
  return {
    projectUsage,
    user,
    classes,
    projects,
    children,
    unconfirmed,
    wallet: wallet[0] || null,
    paymentsEnabled: paymentsEnabled(),
  };
}
