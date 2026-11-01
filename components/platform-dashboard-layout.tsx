"use client";
import { useState, type ReactNode } from "react";
import {
  Home,
  School,
  UsersRound,
  Presentation,
  FolderKanban,
  ShieldCheck,
  Building2,
  Menu,
  X,
  Plus,
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
    id: "teachers",
    label: "Teachers",
    icon: Presentation,
    description: "Your classroom teaching teams.",
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
export const schoolSectionPath = (section: string) =>
  section === "overview"
    ? "/home"
    : section === "classes"
      ? "/classrooms"
      : section === "alerts"
        ? "/safety"
        : `/${section}`;
export const SCHOOL_ADMIN_SECTIONS = [
  {
    id: "overview",
    label: "Overview",
    icon: Home,
    description: "Your school, classrooms and safety activity.",
  },
  {
    id: "classes",
    label: "Classrooms",
    icon: School,
    description: "Teaching teams and students in each classroom.",
  },
  {
    id: "teachers",
    label: "Teachers",
    icon: Presentation,
    description: "Your school’s teachers and their classrooms.",
  },
  {
    id: "students",
    label: "Students",
    icon: UsersRound,
    description: "Enroll students and manage classroom membership.",
  },
  {
    id: "projects",
    label: "Projects",
    icon: FolderKanban,
    description:
      "Create your own projects and share them with your classrooms.",
  },
  {
    id: "alerts",
    label: "Safety",
    icon: ShieldCheck,
    description:
      "Review student safety, prompting guidance and alerts across your school.",
  },
] as const;
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
  {
    id: "projects",
    label: "Projects",
    icon: FolderKanban,
    description: "Find and open your projects.",
  },
] as const;
export function PlatformDashboardLayout({
  teacher,
  schoolMode = false,
  name,
  schoolName,
  accountLoading = false,
  creditBalanceMicros,
  section,
  onSectionChange,
  children,
  headerAction,
}: {
  teacher: boolean;
  schoolMode?: boolean;
  accountLoading?: boolean;
  name?: string;
  schoolName?: string | null;
  creditBalanceMicros?: number;
  section: string;
  onSectionChange: (section: string) => void;
  children: ReactNode;
  headerAction?: ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const sections = schoolMode
    ? SCHOOL_ADMIN_SECTIONS
    : teacher
      ? TEACHER_SECTIONS
      : BUILDER_SECTIONS;
  const current =
    (section === "profile"
      ? {
          label: "Profile",
          description: teacher
            ? "Manage your profile and account."
            : "Your spending, account and parent top-ups.",
        }
      : sections.find((s) => s.id === section)) || sections[0];
  return (
    <div className="df-teacher-dashboard">
      <StudioSidebar
        roleLabel={schoolMode ? "School Admin" : undefined}
        caption={schoolMode ? "" : undefined}
        onProfileOpen={() => setNavOpen(false)}
        name={name}
        schoolName={schoolName}
        accountLoading={accountLoading}
        creditBalanceMicros={creditBalanceMicros}
        role={teacher ? "teacher" : "child"}
        label={
          schoolMode
            ? "School Admin sidebar"
            : teacher
              ? "Teacher sidebar"
              : "Builder sidebar"
        }
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
            aria-label={
              schoolMode
                ? "School sections"
                : teacher
                  ? "Teacher sections"
                  : "Builder sections"
            }
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
            <CreateProjectDialog
              trigger={
                <button
                  type="button"
                  aria-label="Create a project"
                  title="Create a project"
                >
                  <Plus size={20} aria-hidden="true" />
                  <span>Create a project</span>
                </button>
              }
            />
          </nav>
        }
      />
      <main
        className={`df-page df-teacher-content ${!teacher && section === "home" ? "df-builder-home" : ""}`}
      >
        {(teacher || section !== "home") && (
          <header className="df-teacher-header">
            <div className="df-header-default">
              <h1>{current.label}</h1>
              <p className="df-muted">{current.description}</p>
            </div>
            <div id="dashboard-detail-header" />
            {headerAction}
          </header>
        )}
        <div className="df-container">{children}</div>
      </main>
    </div>
  );
}
