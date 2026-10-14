import { getProfile, platformEnabled, checkOrigin } from "@/lib/platform-auth";
import { classroomAccess } from "@/lib/classroom-data";
import { database } from "@/lib/database";
import { runtimePreview } from "@/lib/project-runtime";
import { touchRuntime } from "@/lib/runtime-lifecycle";
import { previewResponding } from "@/lib/runtime-readiness";
export const maxDuration = 60;
export async function POST(
  req: Request,
  { params }: { params: Promise<{ classId: string; projectId: string }> },
) {
  const user = platformEnabled() ? await getProfile() : null;
  if (!user || !checkOrigin(req))
    return Response.json({ error: "Not allowed." }, { status: 403 });
  const { classId, projectId } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(classId) || !/^vm-[a-z0-9]+$/.test(projectId))
    return Response.json({ error: "Invalid project." }, { status: 400 });
  const classroom = await classroomAccess(classId, user);
  if (!classroom)
    return Response.json({ error: "Classroom not found." }, { status: 404 });
  const { rows } = await database().query(
    `select p.metadata from adorable.class_projects cp join adorable.projects p on p.vm_id=cp.vm_id where cp.class_id=$1 and cp.vm_id=$2 and (p.owner_id=$3 or exists(select 1 from adorable.class_members m where m.class_id=$1 and m.child_id=p.owner_id))`,
    [classId, projectId, classroom.teacher_id],
  );
  if (!rows.length)
    return Response.json(
      { error: "Project not found in this classroom." },
      { status: 404 },
    );
  if (rows[0].metadata.staticProductionUrl)
    return Response.json({ url: rows[0].metadata.staticProductionUrl });
  try {
    await touchRuntime(projectId);
    const preview = await runtimePreview(projectId);
    if (
      !(await previewResponding(preview.baseUrl, (url, options) =>
        fetch(url, {
          ...options,
          headers: preview.token
            ? { "x-runtime-preview-token": preview.token }
            : {},
        }),
      ))
    )
      return Response.json({ starting: true }, { status: 202 });
    return Response.json({ url: preview.url });
  } catch {
    return Response.json(
      { error: "Could not open the project preview. Please try again." },
      { status: 503 },
    );
  }
}
