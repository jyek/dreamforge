import { removeStaleE2eProjects } from "@/lib/e2e-cleanup";
import { platformEnabled } from "@/lib/platform-auth";
import { reconcileExpiredUsage } from "@/lib/platform-usage";
import { pauseInactiveRuntimes } from "@/lib/runtime-lifecycle";
import { prepareProjectRuntime } from "@/lib/prepare-project-runtime";
import { database } from "@/lib/database";
export const maxDuration = 300;
const authorized = (request: Request) =>
  !!process.env.CRON_SECRET &&
  request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
export async function GET(request: Request) {
  if (!authorized(request))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (platformEnabled()) await reconcileExpiredUsage();
  await pauseInactiveRuntimes();
  const testProjectsRemoved = await removeStaleE2eProjects();
  return Response.json({ ok: true, testProjectsRemoved });
}
export async function POST(request: Request) {
  if (!authorized(request))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await request.json().catch(() => ({}));
  if (
    payload.action !== "prepare-project" ||
    !/^vm-[a-z0-9]+$/.test(payload.projectId)
  )
    return Response.json(
      { error: "Invalid maintenance action" },
      { status: 400 },
    );
  const { rowCount } = await database().query(
    "select 1 from runtime_bindings where project_id=$1",
    [payload.projectId],
  );
  if (!rowCount)
    return Response.json({ error: "Runtime not found" }, { status: 404 });
  try {
    await prepareProjectRuntime(payload.projectId);
    return Response.json({ ok: true, projectId: payload.projectId });
  } catch (error) {
    console.error(
      "Project runtime initialization failed",
      payload.projectId,
      error,
    );
    return Response.json(
      {
        error:
          "Developer runtime could not be prepared. Review maintenance logs.",
      },
      { status: 503 },
    );
  }
}
