import { getProfile } from "@/lib/platform-auth";
import { studentProjectData } from "@/lib/student-project-data";
export async function GET(req: Request) {
  const user = await getProfile();
  if (user?.role !== "teacher")
    return Response.json(
      { error: "Teacher access required." },
      { status: 403 },
    );
  const p = new URL(req.url).searchParams,
    studentId = p.get("studentId") || undefined;
  if (!studentId || !/^[a-f0-9-]{36}$/i.test(studentId))
    return Response.json({ error: "Invalid student." }, { status: 400 });
  const data = await studentProjectData(user.id, { studentId });
  return data
    ? Response.json(data)
    : Response.json({ error: "Student not found." }, { status: 404 });
}
