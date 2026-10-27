import { loadDashboardData } from "@/lib/platform-dashboard-data";
import { getProfile, platformEnabled } from "@/lib/platform-auth";
export async function GET() {
  if (!platformEnabled())
    return Response.json({ error: "Unavailable" }, { status: 404 });
  const user = await getProfile();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  return Response.json(await loadDashboardData(user), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
