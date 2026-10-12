import { authorizeProject } from "@/lib/project-access";
import { touchRuntime } from "@/lib/runtime-lifecycle";
import { readProjectMetadata } from "@/lib/project-storage";
import { devVm, startDevServer } from "@/lib/project-vm";
import { previewResponding, runtimeFailure } from "@/lib/runtime-readiness";

export const maxDuration = 60;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  if (!/^vm-[a-z0-9]+$/.test(projectId))
    return Response.json({ error: "Invalid project" }, { status: 400 });
  if (!(await authorizeProject(projectId)))
    return Response.json({ error: "Project not found" }, { status: 404 });
  try {
    const activity = await touchRuntime(projectId);
    const metadata = await readProjectMetadata(projectId);
    const ready = await previewResponding(`https://${metadata.previewDomain}`);
    if (!ready) {
      const vm = devVm(projectId);
      if ((await vm.data()).state === "running") await startDevServer(vm);
    }
    return Response.json(
      { ...activity, state: ready ? "active" : "starting", ready },
      { status: ready ? 200 : 202 },
    );
  } catch (error) {
    const failure = runtimeFailure(error);
    return Response.json(failure.body, { status: failure.status });
  }
}
