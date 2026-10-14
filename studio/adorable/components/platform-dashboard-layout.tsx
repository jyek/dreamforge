"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Home,
  School,
  UsersRound,
  FolderKanban,
  MessagesSquare,
  Settings,
  Menu,
  X,
} from "lucide-react";
import { StudioSidebar } from "./studio-sidebar";
export const TEACHER_SECTIONS = [
  {
    id: "home",
    label: "Home",
    icon: Home,
    description: "An overview of your builders and their progress.",
  },
  {
    id: "classrooms",
    label: "Classrooms",
    icon: School,
    description: "Manage your classes and invitation codes.",
  },
  {
    id: "builders",
    label: "Builders",
    icon: UsersRound,
    description: "See your roster and each builder’s token usage.",
  },
  {
    id: "projects",
    label: "Projects",
    icon: FolderKanban,
    description: "Explore the projects your builders are creating.",
  },
  {
    id: "prompts",
    label: "Prompts",
    icon: MessagesSquare,
    description: "Review prompts and safety flags by project.",
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    description: "Manage teacher invitations.",
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
    id: "projects",
    label: "Projects",
    icon: FolderKanban,
    description: "Pick up a creation or start something new.",
  },
  {
    id: "classrooms",
    label: "Classrooms",
    icon: School,
    description: "Your classes and invitation codes.",
  },
] as const;
export function PlatformDashboardLayout({
  teacher,
  name,
  remainingTokens,
  section,
  onSectionChange,
  children,
}: {
  teacher: boolean;
  name?: string;
  remainingTokens?: number;
  section: string;
  onSectionChange: (section: string) => void;
  children: ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const sections = teacher ? TEACHER_SECTIONS : BUILDER_SECTIONS;
  const current =
    (!teacher && section === "profile"
      ? {
          label: "Profile",
          description: "Your token usage and parent top-ups.",
        }
      : sections.find((s) => s.id === section)) || sections[0];
  return (
    <div className="df-teacher-dashboard">
      <StudioSidebar
        onProfileOpen={() => setNavOpen(false)}
        name={name}
        remainingTokens={remainingTokens}
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
      />
      <main className="df-page df-teacher-content">
        <header className="df-teacher-header">
          <div>
            <p className="df-eyebrow">YOUR DREAMFORGE STUDIO</p>
            <h1>{current.label}</h1>
            <p className="df-muted">{current.description}</p>
          </div>
          <Link href="/examples" className="df-button secondary small">
            Explore examples ↗
          </Link>
        </header>
        <div className="df-container">{children}</div>
      </main>
    </div>
  );
}
