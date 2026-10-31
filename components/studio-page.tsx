import { database } from "@/lib/database";
import { administeredSchool } from "@/lib/schools";
import { schoolOverview } from "@/lib/school-admin";
import { SchoolOverview } from "./school-overview";
import { loadDashboardData } from "@/lib/platform-dashboard-data";
import { redirect } from "next/navigation";
import { getProfile, platformEnabled } from "@/lib/platform-auth";
import { PlatformDashboard } from "./platform-dashboard";
export async function StudioPage({ section }: { section: string }) {
  if (!platformEnabled()) redirect("/");
  const user = await getProfile();
  if (!user) redirect("/login");
  if (section === "settings") redirect("/profile");
  const schoolId = await administeredSchool(database(), user.id);
  if (schoolId && section !== "profile") {
    if (
      !["home", "classrooms", "teachers", "students", "safety"].includes(
        section,
      )
    )
      redirect("/home");
    const data = await schoolOverview(database(), schoolId);
    if (data)
      return (
        <SchoolOverview
          initial={data}
          name={user.display_name}
          initialSection={
            section === "classrooms"
              ? "classes"
              : section === "safety"
                ? "alerts"
                : section === "home"
                  ? "overview"
                  : section
          }
        />
      );
  }
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
