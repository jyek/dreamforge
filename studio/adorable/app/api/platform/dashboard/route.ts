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
      : "select c.id,c.name from adorable.classes c join adorable.class_members m on m.class_id=c.id where m.child_id=$1 order by c.created_at",
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
  return Response.json({
    user,
    classes,
    projects,
    children,
    unconfirmed,
    wallet: wallet[0] || null,
    paymentsEnabled:
      !!process.env.STRIPE_SECRET_KEY &&
      !!process.env.STRIPE_WEBHOOK_SECRET &&
      process.env.DREAMFORGE_PAYMENTS_ENABLED === "true",
  });
}
