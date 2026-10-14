import { redirect } from "next/navigation";
import { getProfile, platformEnabled } from "@/lib/platform-auth";
import { PlatformDashboard } from "@/components/platform-dashboard";
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  if (!platformEnabled()) redirect("/");
  const user = await getProfile();
  if (!user) redirect("/login");
  const { section } = await searchParams;
  const allowed =
    user.role === "teacher"
      ? ["home", "classrooms", "builders", "projects", "prompts", "settings"]
      : ["home", "projects", "classrooms", "tokens"];
  return (
    <PlatformDashboard
      initialSection={section && allowed.includes(section) ? section : "home"}
      initialUser={{ display_name: user.display_name, role: user.role }}
    />
  );
}
