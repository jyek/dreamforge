import { database } from "./database";
import { isPlatformAdmin } from "./admin-auth";
export class AdminShowcaseError extends Error {
  constructor(
    message: string,
    readonly status = 409,
  ) {
    super(message);
  }
}
export type AdminProject = {
  id: string;
  name: string;
  owner: string;
  owned: boolean;
  exampleId: string | null;
  featured: boolean;
  order: number;
  description: string;
  copiedAt: string | null;
};
export async function loadAdminProjects(
  actorId: string,
): Promise<AdminProject[]> {
  if (!(await isPlatformAdmin(actorId)))
    throw new AdminShowcaseError("Administrator access is required.", 403);
  const { rows } = await database().query(
    "select p.vm_id,p.owner_id,p.is_showcased,p.metadata,p.updated_at,pr.display_name as owner_name from projects p left join profiles pr on pr.id=p.owner_id order by p.updated_at desc",
  );
  const sourceIds = new Set(rows.map((r) => r.vm_id));
  return rows
    .filter(
      (r) =>
        !r.metadata.showcaseSourceId ||
        !sourceIds.has(r.metadata.showcaseSourceId),
    )
    .map((r) => ({
      id: r.vm_id,
      name: r.metadata.name || "Untitled project",
      owner: r.owner_name || "Example library",
      owned: !!r.owner_id,
      exampleId: r.vm_id,
      featured: r.is_showcased,
      order: Number(r.metadata.exampleOrder || 999),
      description: r.metadata.description || "",
      copiedAt: null,
    }));
}
export async function changeShowcase(
  actorId: string,
  action: unknown,
  projectId?: unknown,
  order?: unknown,
) {
  if (!(await isPlatformAdmin(actorId)))
    throw new AdminShowcaseError("Administrator access is required.", 403);
  if (action === "reorder") {
    if (
      !Array.isArray(order) ||
      order.length > 100 ||
      order.some((x) => typeof x !== "string" || !/^vm-[a-z0-9]+$/.test(x)) ||
      new Set(order).size !== order.length
    )
      throw new AdminShowcaseError(
        "Send each showcased project exactly once.",
        400,
      );
    const db = await database().connect();
    try {
      await db.query("begin");
      await db.query(
        "select pg_advisory_xact_lock(hashtext('admin-showcase-order'))",
      );
      if (
        !(
          await db.query("select 1 from platform_admins where profile_id=$1", [
            actorId,
          ])
        ).rowCount
      )
        throw new AdminShowcaseError("Administrator access is required.", 403);
      const { rows } = await db.query(
        "select vm_id from projects where is_showcased for update",
      );
      if (
        rows.length !== order.length ||
        rows.some((r) => !order.includes(r.vm_id))
      )
        throw new AdminShowcaseError(
          "The showcase changed. Reload it before saving its order.",
        );
      for (const [i, id] of order.entries())
        await db.query(
          "update projects set metadata=metadata||jsonb_build_object('exampleOrder',$2::text) where vm_id=$1",
          [id, String(i + 1)],
        );
      await db.query(
        "insert into admin_audit_log(actor_id,action,details) values($1,'showcase.reordered',$2)",
        [actorId, JSON.stringify({ projectIds: order })],
      );
      await db.query("commit");
      return;
    } catch (error) {
      await db.query("rollback");
      throw error;
    } finally {
      db.release();
    }
  }
  if (
    !["feature", "hide"].includes(String(action)) ||
    typeof projectId !== "string" ||
    !/^vm-[a-z0-9]+$/.test(projectId)
  )
    throw new AdminShowcaseError("Choose a project and a valid action.", 400);
  const {
    rows: [source],
  } = await database().query(
    "select vm_id,owner_id,metadata from projects where vm_id=$1",
    [projectId],
  );
  if (
    !source ||
    (source.metadata.showcaseSourceId &&
      (
        await database().query("select 1 from projects where vm_id=$1", [
          source.metadata.showcaseSourceId,
        ])
      ).rowCount)
  )
    throw new AdminShowcaseError("Project not found.", 404);
  const exampleId = source.vm_id;
  const db = await database().connect();
  try {
    await db.query("begin");
    await db.query(
      "select pg_advisory_xact_lock(hashtext('admin-showcase-order'))",
    );
    // Recheck membership after waiting for another administrative write.
    if (
      !(
        await db.query("select 1 from platform_admins where profile_id=$1", [
          actorId,
        ])
      ).rowCount
    )
      throw new AdminShowcaseError("Administrator access is required.", 403);
    await db.query("select vm_id from projects where vm_id=$1 for update", [
      exampleId,
    ]);
    const {
      rows: [position],
    } = await db.query(
      "select coalesce(max(case when metadata->>'exampleOrder' ~ '^[0-9]{1,9}$' then (metadata->>'exampleOrder')::integer else 0 end),0)+1 as next from projects where is_showcased",
    );
    const result = await db.query(
      "update projects set is_showcased=$2,metadata=(metadata-'exampleArchived')||jsonb_build_object('exampleOrder',case when $2 and not is_showcased then $3::text else coalesce(metadata->>'exampleOrder',$3::text) end),updated_at=now() where vm_id=$1",
      [exampleId, action === "feature", String(position.next)],
    );
    if (!result.rowCount)
      throw new AdminShowcaseError("The project is unavailable.");
    await db.query(
      "insert into admin_audit_log(actor_id,action,project_id,details) values($1,$2,$3,$4)",
      [
        actorId,
        action === "feature" ? "showcase.featured" : "showcase.hidden",
        exampleId,
        JSON.stringify({ sourceProjectId: projectId }),
      ],
    );
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    db.release();
  }
}
