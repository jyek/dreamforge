import { getProfile, checkOrigin } from "@/lib/platform-auth";
import { removeE2eProject, TestCleanupError } from "@/lib/e2e-cleanup";
export const maxDuration = 300;
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getProfile();
  if (!checkOrigin(request) || !user)
    return Response.json(
      { error: "Sign in to clean up your test project." },
      { status: 403 },
    );
  const { projectId } = await params;
  if (!/^vm-[a-z0-9]+$/.test(projectId))
    return Response.json({ error: "Invalid project." }, { status: 400 });
  try {
    return Response.json(await removeE2eProject(projectId, user.id));
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof TestCleanupError
            ? error.message
            : "Test cleanup failed. Retry cleanup before running another test.",
      },
      { status: error instanceof TestCleanupError ? error.status : 503 },
    );
  }
}
