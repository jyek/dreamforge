import { paymentsEnabled } from "@/lib/topup-packages";
import { database } from "@/lib/database";
import { getProfile, platformEnabled } from "@/lib/platform-auth";
export async function GET() {
  if (!platformEnabled())
    return Response.json({ error: "Unavailable" }, { status: 404 });
  const user = await getProfile();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const db = database();
  const { rows: classes } = await db.query(
    user.role === "teacher"
      ? "select id,name,invite_code from adorable.classes where teacher_id=$1 order by created_at"
      : "select c.id,c.name,pr.display_name as teacher_name from adorable.classes c join adorable.profiles pr on pr.id=c.teacher_id join adorable.class_members m on m.class_id=c.id where m.child_id=$1 order by c.created_at",
    [user.id],
  );
  const { rows: projects } = await db.query(
    `select p.vm_id,p.metadata,pr.display_name as child_name from adorable.projects p join adorable.profiles pr on pr.id=p.owner_id where not p.is_example and (p.owner_id=$1 or ($2='teacher' and exists(select 1 from adorable.teacher_builders b where b.child_id=p.owner_id and b.teacher_id=$1))) order by p.updated_at desc`,
    [user.id, user.role],
  );
  const { rows: children } =
    user.role === "teacher"
      ? await db.query(
          `select distinct pr.id,pr.display_name,pr.username,a.token_limit,a.used_tokens,a.reserved_tokens,a.input_tokens,a.output_tokens,a.estimated_cost_usd from adorable.profiles pr join adorable.teacher_builders b on b.child_id=pr.id left join adorable.token_accounts a on a.child_id=pr.id where b.teacher_id=$1`,
          [user.id],
        )
      : { rows: [] };
  const { rows: wallet } =
    user.role === "child"
      ? await db.query(
          "select token_limit,used_tokens,reserved_tokens,input_tokens,output_tokens,estimated_cost_usd from adorable.token_accounts where child_id=$1",
          [user.id],
        )
      : { rows: [] };
  const { rows: unconfirmed } =
    user.role === "teacher"
      ? await db.query(
          `select r.id,r.reserved_tokens,pr.display_name from adorable.usage_runs r join adorable.profiles pr on pr.id=r.child_id where r.state='uncertain' and exists(select 1 from adorable.teacher_builders b where b.child_id=r.child_id and b.teacher_id=$1)`,
          [user.id],
        )
      : await db.query(
          "select id,reserved_tokens from adorable.usage_runs where child_id=$1 and state='uncertain'",
          [user.id],
        );
  const { rows: projectUsage } =
    user.role === "child"
      ? await db.query(
          `select p.vm_id,p.metadata->>'name' as project_name,
    coalesce(sum(case when r.state='settled' then coalesce(r.input_tokens,0)+coalesce(r.output_tokens,0) else 0 end),0)::text as used_tokens,
    coalesce(sum(case when r.state='settled' then r.input_tokens else 0 end),0)::text as input_tokens,
    coalesce(sum(case when r.state='settled' then r.output_tokens else 0 end),0)::text as output_tokens
    from adorable.projects p left join adorable.usage_runs r on r.vm_id=p.vm_id and r.child_id=$1
    where p.owner_id=$1 and not p.is_example group by p.vm_id,p.metadata,p.updated_at order by p.updated_at desc`,
          [user.id],
        )
      : { rows: [] };
  return Response.json({
    projectUsage,
    user,
    classes,
    projects,
    children,
    unconfirmed,
    wallet: wallet[0] || null,
    paymentsEnabled: paymentsEnabled(),
  });
}
