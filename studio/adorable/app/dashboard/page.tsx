import { redirect } from "next/navigation";
import { getProfile, platformEnabled } from "@/lib/platform-auth";
import { PlatformDashboard } from "@/components/platform-dashboard";
export default async function Dashboard() {
  if (!platformEnabled()) redirect("/");
  if (!(await getProfile())) redirect("/login");
  return <PlatformDashboard />;
}
