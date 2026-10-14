import { redirect } from "next/navigation";
import { getProfile, platformEnabled } from "@/lib/platform-auth";
import { PlatformDashboard } from "@/components/platform-dashboard";
export default async function Dashboard() {
  if (!platformEnabled()) redirect("/");
  const user = await getProfile();
  if (!user) redirect("/login");
  return (
    <PlatformDashboard
      initialUser={{ display_name: user.display_name, role: user.role }}
    />
  );
}
