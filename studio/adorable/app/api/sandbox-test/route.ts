import { cookies } from "next/headers";
import {
  VercelTestWorkspace,
  VERCEL_TEST_PAGE,
  validVercelTestName,
} from "@/lib/vercel-workspace-test";

export const maxDuration = 300;
const enabled = () =>
  process.env.VERCEL_SANDBOX_TEST_ENABLED === "true" &&
  process.env.VERCEL_ENV !== "production";
const cookieName = "dreamforge-vercel-pilot";

export async function GET() {
  if (!enabled())
    return Response.json(
      { error: "Test workspace is disabled" },
      { status: 404 },
    );
  const name = (await cookies()).get(cookieName)?.value;
  if (!name || !validVercelTestName(name))
    return Response.json({ workspace: null });
  try {
    return Response.json(
      { workspace: (await VercelTestWorkspace.get(name)).status() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ workspace: null });
  }
}

export async function POST(request: Request) {
  if (!enabled())
    return Response.json(
      { error: "Test workspace is disabled" },
      { status: 404 },
    );
  const allowedOrigin =
    process.env.PUBLIC_APP_ORIGIN || new URL(request.url).origin;
  if (request.headers.get("origin") !== allowedOrigin)
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  const { action } = await request.json().catch(() => ({}));
  if (
    !["create", "pause", "resume", "edit", "delete", "touch"].includes(action)
  )
    return Response.json({ error: "Invalid action" }, { status: 400 });
  const jar = await cookies();
  try {
    let workspace: VercelTestWorkspace;
    if (action === "create") {
      if (jar.get(cookieName))
        return Response.json(
          {
            error:
              "Remove the existing test workspace before creating another.",
          },
          { status: 409 },
        );
      workspace = await VercelTestWorkspace.create();
      try {
        await workspace.writeFile("/workspace/app/page.tsx", VERCEL_TEST_PAGE);
      } catch (error) {
        await workspace.delete();
        throw error;
      }
      jar.set(cookieName, workspace.sandbox.name, {
        httpOnly: true,
        sameSite: "strict",
        secure: new URL(request.url).protocol === "https:",
        path: "/",
        maxAge: 7 * 24 * 60 * 60,
      });
    } else {
      const name = jar.get(cookieName)?.value;
      if (!name || !validVercelTestName(name))
        return Response.json(
          { error: "Create a test workspace first" },
          { status: 404 },
        );
      workspace = await VercelTestWorkspace.get(name);
      if (action === "touch" && workspace.sandbox.status === "running")
        await workspace.renew();
      if (action === "pause") await workspace.pause();
      if (action === "resume") await workspace.start();
      if (action === "edit") {
        await workspace.start();
        await workspace.writeFile(
          "/workspace/app/page.tsx",
          VERCEL_TEST_PAGE.replace(
            "Workspace test is running",
            "Live file edit works",
          ),
        );
      }
      if (action === "delete") {
        await workspace.delete();
        jar.delete(cookieName);
        return Response.json({ workspace: null });
      }
    }
    return Response.json(
      { workspace: workspace.status() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(
      "Vercel workspace pilot failed",
      error instanceof Error ? error.message : "Unknown failure",
    );
    return Response.json(
      {
        error:
          "The test workspace could not complete this action. Check the test deployment logs.",
      },
      { status: 503 },
    );
  }
}
