"use client";
import { useEffect, useState, type ReactNode } from "react";
import {
  Home,
  School,
  UsersRound,
  FolderKanban,
  ShieldCheck,
  Building2,
  Menu,
  X,
} from "lucide-react";
import { CreateProjectDialog } from "./create-project-dialog";
import { StudioSidebar } from "./studio-sidebar";
export const TEACHER_SECTIONS = [
  {
    id: "home",
    label: "Home",
    icon: Home,
    description: "An overview of your students and their progress.",
  },
  {
    id: "classrooms",
    label: "Classrooms",
    icon: School,
    description: "Manage your students and classrooms.",
  },
  {
    id: "students",
    label: "Students",
    icon: UsersRound,
    description: "See your students, projects, and areas for guidance.",
  },
  {
    id: "projects",
    label: "Projects",
    icon: FolderKanban,
    description:
      "Create your own projects and share them with your classrooms.",
  },
  {
    id: "safety",
    label: "Safety",
    icon: ShieldCheck,
    description: "Review safety concerns and guide your students.",
  },
] as const;
/** Shown to teachers who also administer a school. */
export const SCHOOL_SECTION = {
  id: "school",
  label: "School",
  icon: Building2,
  description: "Your school's teachers, classes and safety overview.",
} as const;
export const BUILDER_SECTIONS = [
  {
    id: "home",
    label: "Home",
    icon: Home,
    description: "Pick a project or bring a new idea to life.",
  },
  {
    id: "classrooms",
    label: "Classrooms",
    icon: School,
    description: "A place to learn, create, and build together.",
  },
] as const;
export function PlatformDashboardLayout({
  teacher,
  name,
  accountLoading = false,
  creditBalanceMicros,
  section,
  onSectionChange,
  children,
  headerAction,
}: {
  teacher: boolean;
  accountLoading?: boolean;
  name?: string;
  creditBalanceMicros?: number;
  section: string;
  onSectionChange: (section: string) => void;
  children: ReactNode;
  headerAction?: ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const [schoolAdmin, setSchoolAdmin] = useState(false);
  useEffect(() => {
    if (!teacher) return;
    let stopped = false;
    void fetch("/api/platform/school/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !stopped && setSchoolAdmin(d?.schoolAdmin === true))
      .catch(() => {});
    return () => {
      stopped = true;
    };
  }, [teacher]);
  const sections = teacher
    ? schoolAdmin
      ? [...TEACHER_SECTIONS, SCHOOL_SECTION]
      : TEACHER_SECTIONS
    : BUILDER_SECTIONS;
  const current =
    (section === "profile"
      ? {
          label: "Profile",
          description: teacher
            ? "Manage your teacher profile and account."
            : "Your spending, account and parent top-ups.",
        }
      : sections.find((s) => s.id === section)) || sections[0];
  return (
    <div className="df-teacher-dashboard">
      <StudioSidebar
        onProfileOpen={() => setNavOpen(false)}
        name={name}
        accountLoading={accountLoading}
        creditBalanceMicros={creditBalanceMicros}
        role={teacher ? "teacher" : "child"}
        label={teacher ? "Teacher sidebar" : "Builder sidebar"}
        className={navOpen ? "is-open" : ""}
        toggle={
          <button
            className="df-mobile-menu"
            aria-label={navOpen ? "Close navigation" : "Open navigation"}
            aria-controls="studio-sections"
            aria-expanded={navOpen}
            onClick={() => setNavOpen(!navOpen)}
          >
            {navOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        }
        navigation={
          <nav
            id="studio-sections"
            className="df-studio-nav"
            aria-label={teacher ? "Teacher sections" : "Builder sections"}
          >
            {sections.map((s) => (
              <button
                key={s.id}
                aria-label={s.label}
                title={s.label}
                aria-current={section === s.id ? "page" : undefined}
                onClick={() => {
                  onSectionChange(s.id);
                  setNavOpen(false);
                }}
              >
                <s.icon size={20} aria-hidden="true" />
                <span>{s.label}</span>
              </button>
            ))}
          </nav>
        }
      >
        {!teacher && section !== "classrooms" && (
          <div className="df-sidebar-create">
            <CreateProjectDialog />
          </div>
        )}
      </StudioSidebar>
      <main
        className={`df-page df-teacher-content ${!teacher && section === "home" ? "df-builder-home" : ""}`}
      >
        {(teacher || section !== "home") && (
          <header className="df-teacher-header">
            <div>
              <h1>{current.label}</h1>
              <p className="df-muted">{current.description}</p>
            </div>
            {headerAction}
          </header>
        )}
        <div className="df-container">{children}</div>
      </main>
    </div>
  );
}
