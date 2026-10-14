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
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { DreamForgeBrand } from "./dreamforge-brand";
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
async function signOut() {
  await fetch("/api/platform/auth", { method: "DELETE" });
  window.location.assign("/login");
}
export function PlatformDashboardLayout({
  teacher,
  name,
  section,
  onSectionChange,
  children,
}: {
  teacher: boolean;
  name?: string;
  section: string;
  onSectionChange: (section: string) => void;
  children: ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);
  if (!teacher)
    return (
      <main className="df-page">
        <header className="df-header">
          <DreamForgeBrand />
          <nav className="df-nav">
            <Link href="/examples">Examples</Link>
            <button className="df-button secondary small" onClick={signOut}>
              Sign out
            </button>
          </nav>
        </header>
        <div className="df-container">{children}</div>
      </main>
    );
  const current =
    TEACHER_SECTIONS.find((s) => s.id === section) || TEACHER_SECTIONS[0];
  return (
    <div className="df-teacher-dashboard">
      <aside
        className={`df-teacher-sidebar ${navOpen ? "is-open" : ""}`}
        aria-label="Teacher sidebar"
      >
        <div className="df-sidebar-brand">
          <DreamForgeBrand />
          <button
            className="df-mobile-menu"
            aria-label={navOpen ? "Close navigation" : "Open navigation"}
            aria-controls="teacher-sections"
            aria-expanded={navOpen}
            onClick={() => setNavOpen(!navOpen)}
          >
            {navOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        <p className="df-sidebar-caption">TEACHER STUDIO</p>
        <nav
          id="teacher-sections"
          className="df-teacher-nav"
          aria-label="Teacher sections"
        >
          {TEACHER_SECTIONS.map((s) => (
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
        <div className="df-sidebar-account">
          <span className="df-teacher-avatar" aria-hidden="true">
            {name?.charAt(0).toUpperCase() || "T"}
          </span>
          <div>
            <strong>{name}</strong>
            <small>Teacher</small>
          </div>
          <button aria-label="Sign out" title="Sign out" onClick={signOut}>
            <LogOut size={18} />
          </button>
        </div>
      </aside>
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
