import { TeacherPeopleDirectory } from "./teacher-people-directory";
import { directoryData } from "@/lib/people-directory";
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
  if (schoolId && section !== "profile" && section !== "projects") {
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
  if (
    user.role === "teacher" &&
    (section === "students" || section === "teachers")
  )
    return (
      <TeacherPeopleDirectory
        section={section}
        name={user.display_name}
        schoolName={user.school_name}
        data={await directoryData(database(), user.id)}
      />
    );
  const allowed =
    user.role === "teacher"
      ? ["home", "projects", "classrooms", "students", "safety", "profile"]
      : ["home", "classrooms", "projects", "profile"];
  if (!allowed.includes(section)) redirect("/home");
  const data = await loadDashboardData(user, section);
  return (
    <PlatformDashboard
      initialData={data}
      schoolMode={!!schoolId}
      initialSection={section}
      initialUser={{
        display_name: user.display_name,
        role: user.role,
        school_name: user.school_name,
      }}
    />
  );
}
