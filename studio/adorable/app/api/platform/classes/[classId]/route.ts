import { database } from "@/lib/database";
import { getProfile, platformEnabled } from "@/lib/platform-auth";
import { studentProjectData } from "@/lib/student-project-data";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ classId: string }> },
) {
  const user = platformEnabled() ? await getProfile() : null;
  if (user?.role !== "teacher")
    return Response.json(
      { error: "Teacher access required." },
      { status: 403 },
    );
  const { classId } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(classId))
    return Response.json({ error: "Invalid classroom." }, { status: 400 });
  const db = database();
  const { rows: classes } = await db.query(
    "select id,name from adorable.classes where id=$1 and teacher_id=$2",
    [classId, user.id],
  );
  if (!classes.length)
    return Response.json({ error: "Classroom not found." }, { status: 404 });
  const data = await studentProjectData(user.id, { classId });
  return Response.json({ classroom: classes[0], ...data });
}
