import { randomUUID } from "node:crypto";
import { authorizeProject } from "@/lib/project-access";
import { runtimePreview } from "@/lib/project-runtime";
import { childPolicy } from "@/lib/child-policy";
import { database } from "@/lib/database";
import { getProfile, platformEnabled, checkOrigin } from "@/lib/platform-auth";
import { projectAccess } from "@/lib/harness-access";
import {
  beginRun,
  finishRun,
  executionContext,
  assertRun,
} from "@/lib/execution";
import { exportAndPublishStatic } from "@/lib/static-publish";
import { devVm } from "@/lib/project-vm";

export const maxDuration = 300;
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  if (!(await authorizeProject(projectId, true)))
    return Response.json({ error: "Project not found" }, { status: 404 });
  if (childPolicy().enabled) {
    const {
      rows: [share],
    } = await database().query(
      "select url,revision,created_at from adorable.approved_shares where project_id=$1 order by created_at desc limit 1",
      [projectId],
    );
    return Response.json(share || { url: null, approvalRequired: true }, {
      headers: { "Cache-Control": "no-store" },
    });
  }
  const preview = await runtimePreview(projectId, true);
  return Response.json(
    { url: preview.url, expiresAt: preview.expiresAt },
    { headers: { "Cache-Control": "no-store" } },
  );
}
/** Only a supervising teacher may publish a frozen artifact. The dev bearer URL is never a share. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  if (!checkOrigin(req) || !(await authorizeProject(projectId, true)))
    return Response.json({ error: "Forbidden" }, { status: 403 });
  const teacher = platformEnabled() ? await getProfile() : null;
  const legacy = platformEnabled()
    ? null
    : await projectAccess(projectId, true);
  if (teacher?.role !== "teacher" && !legacy?.teacher)
    return Response.json(
      { error: "Ask your teacher to approve a fixed project revision." },
      { status: 403 },
    );
  const { revision } = await req.json().catch(() => ({}));
  let run: Awaited<ReturnType<typeof beginRun>> | undefined;
  try {
    run = await beginRun(projectId, randomUUID(), revision, req.signal);
    const active = run;
    const id = randomUUID();
    const url = await executionContext.run(active, async () => {
      await assertRun();
      const result = await exportAndPublishStatic(
        devVm(projectId),
        projectId,
        id,
      );
      await assertRun();
      return result;
    });
    await database().query(
      "insert into adorable.approved_shares(id,project_id,revision,teacher_id,snapshot_id,url) select $1,$2,$3,$4,snapshot_id,$5 from adorable.execution_runs where id=$6",
      [id, projectId, revision, teacher?.id || legacy!.user.id, url, active.id],
    );
    await finishRun(active, "completed");
    // Revision URL remains immutable even if another release is published later.
    return Response.json({ url, revision });
  } catch {
    if (run) await finishRun(run, "failed");
    return Response.json(
      {
        error:
          "This revision could not be shared. Check static hosting, revision and active runs.",
      },
      { status: 409 },
    );
  }
}
