import { authorizeProject } from "@/lib/project-access";
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  if (!(await authorizeProject((await params).projectId)))
    return Response.json({ error: "Forbidden" }, { status: 403 });
  return Response.json(
    {
      error:
        "Runtime uses its workspace preview URL. Custom domains require a paid Runtime account.",
    },
    { status: 400 },
  );
}
