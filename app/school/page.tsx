import { notFound, redirect } from "next/navigation";
import { database } from "@/lib/database";
import { getProfile, platformEnabled } from "@/lib/platform-auth";
import { administeredSchool } from "@/lib/schools";
import { schoolOverview } from "@/lib/school-admin";
import { SchoolOverview } from "@/components/school-overview";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!platformEnabled()) notFound();
  const user = await getProfile();
  if (!user) redirect("/login");
  const schoolId =
    user.role === "teacher"
      ? await administeredSchool(database(), user.id)
      : null;
  if (!schoolId) redirect("/home");
  const overview = await schoolOverview(database(), schoolId);
  if (!overview) redirect("/home");
  return <SchoolOverview initial={overview} name={user.display_name} />;
}
