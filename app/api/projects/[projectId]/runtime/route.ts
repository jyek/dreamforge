import { checkProjectReadiness } from "@/lib/project-readiness";
import { PROJECT_IDLE_SECONDS } from "@/lib/project-idle.mjs";
import { authorizeProject } from "@/lib/project-access";
import { recordRuntimeActivity } from "@/lib/runtime-lifecycle";
import { runtimePreview } from "@/lib/project-runtime";
import { restoreProjectServer } from "@/lib/project-vm";
import { previewResponding, runtimeFailure } from "@/lib/runtime-readiness";
import { snapshotInProgress } from "@/lib/execution";

export const maxDuration = 60;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  if (!/^vm-[a-z0-9]+$/.test(projectId))
    return Response.json({ error: "Invalid project" }, { status: 400 });
  if (!(await authorizeProject(projectId, true)))
    return Response.json({ error: "Project not found" }, { status: 404 });
  try {
    const ready = await checkProjectReadiness({
      capturing: () => snapshotInProgress(projectId),
      recordActivity: () => recordRuntimeActivity(projectId),
      probe: async () => {
        const preview = await runtimePreview(projectId);
        return previewResponding(preview.baseUrl, (url, options) =>
          fetch(url, {
            ...options,
            headers: preview.token
              ? { "x-runtime-preview-token": preview.token }
              : {},
          }),
        );
      },
      repair: () => restoreProjectServer(projectId),
    });
    return Response.json(
      {
        idleSeconds: PROJECT_IDLE_SECONDS,
        state: ready ? "active" : "starting",
        ready,
      },
      { status: ready ? 200 : 202 },
    );
  } catch (error) {
    const failure = runtimeFailure(error);
    return Response.json(failure.body, { status: failure.status });
  }
}
