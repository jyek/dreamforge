import { recoverSnapshot } from "@/lib/recovery";
import { authorizeProject } from "@/lib/project-access";
import { checkOrigin } from "@/lib/platform-auth";
import { database } from "@/lib/database";
import { executionState } from "@/lib/execution";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  if (!(await authorizeProject(projectId, true)))
    return Response.json({ error: "Project not found" }, { status: 404 });
  if (new URL(_req.url).searchParams.get("summary") === "1") {
    const {
      rows: [state],
    } = await database().query(
      "select revision,active_run from adorable.project_execution where project_id=$1",
      [projectId],
    );
    return Response.json(
      {
        revision: Number(state?.revision || 0),
        activeRun: state?.active_run || null,
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
  return Response.json(await executionState(projectId), {
    headers: { "Cache-Control": "no-store" },
  });
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  if (!checkOrigin(req) || !(await authorizeProject(projectId)))
    return Response.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (
    body.action === "recover" &&
    typeof body.runId === "string" &&
    /^[a-f0-9-]{36}$/i.test(body.runId) &&
    Number.isSafeInteger(body.revision)
  ) {
    try {
      return Response.json(
        await recoverSnapshot(projectId, body.runId, body.revision, req.signal),
      );
    } catch {
      return Response.json(
        {
          error:
            "Recovery could not complete. Stop active work or check snapshot availability.",
        },
        { status: 409 },
      );
    }
  }
  if (body.action === "stop") {
    // Keep the lock until the worker acknowledges cancellation. Disconnecting the UI is not Stop.
    await database().query(
      "update adorable.execution_runs set cancel_requested=true where project_id=$1 and state='running'",
      [projectId],
    );
    return Response.json({ state: "cancellation-requested" }, { status: 202 });
  }
  if (body.action === "human-tested" && Number.isSafeInteger(body.revision)) {
    const { rowCount } = await database().query(
      `update adorable.project_execution set verification=coalesce(verification,'{}'::jsonb)||jsonb_build_object('revision',revision,'humanTested',true,'humanTestedAt',now()) where project_id=$1 and revision=$2 and active_run is null`,
      [projectId, body.revision],
    );
    return Response.json({ ok: !!rowCount }, { status: rowCount ? 200 : 409 });
  }
  return Response.json({ error: "Invalid execution action" }, { status: 400 });
}
