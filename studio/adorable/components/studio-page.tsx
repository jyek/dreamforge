import { loadDashboardData } from "@/lib/platform-dashboard-data";
import { redirect } from "next/navigation";
import { getProfile, platformEnabled } from "@/lib/platform-auth";
import { PlatformDashboard } from "./platform-dashboard";
export async function StudioPage({ section }: { section: string }) {
  if (!platformEnabled()) redirect("/");
  const user = await getProfile();
  if (!user) redirect("/login");
  if (section === "settings") redirect("/profile");
  const allowed =
    user.role === "teacher"
      ? ["home", "projects", "classrooms", "students", "safety", "profile"]
      : ["home", "classrooms", "profile"];
  if (!allowed.includes(section)) redirect("/home");
  const data = await loadDashboardData(user, section);
  return (
    <PlatformDashboard
      initialData={data}
      initialSection={section}
      initialUser={{ display_name: user.display_name, role: user.role }}
    />
  );
}
