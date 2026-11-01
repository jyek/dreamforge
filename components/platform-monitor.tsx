"use client";
import { StudentReviewTable } from "./student-review-table";

import { useState, type ReactNode } from "react";
import {
  Building2,
  UsersRound,
  School,
  FolderKanban,
  Menu,
  X,
} from "lucide-react";
import { StudioSidebar } from "./studio-sidebar";
type Row = { id: string; school_id?: string; [key: string]: unknown };
type Directory = Record<
  "teachers" | "students" | "classrooms" | "groups",
  Row[]
>;
export function PlatformMonitor({
  name,
  data,
  schools,
  schoolManagement,
  projects,
}: {
  name: string;
  data: Directory;
  schools: { id: string; name: string }[];
  schoolManagement: ReactNode;
  projects: ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const icons: Record<string, typeof Building2> = {
    schools: Building2,
    teachers: UsersRound,
    students: UsersRound,
    classrooms: School,
    groups: UsersRound,
    projects: FolderKanban,
  };
  const [section, setSection] = useState("schools"),
    [query, setQuery] = useState(""),
    [school, setSchool] = useState("all"),
    [limit, setLimit] = useState(50);
  const tabs = [
    "schools",
    "teachers",
    "students",
    "classrooms",
    "groups",
    "projects",
  ];
  const columns: Record<string, string[]> = {
    teachers: ["name", "username", "school", "school_admin", "classrooms"],
    students: ["name", "username", "school", "classrooms"],
    classrooms: ["name", "school", "teachers", "students"],
    groups: ["name", "school", "owner", "editor", "members"],
  };
  const rows = (data[section as keyof Directory] || []).filter(
    (r) =>
      (school === "all" ||
        (school === "independent" ? !r.school_id : r.school_id === school)) &&
      Object.values(r).join(" ").toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="df-teacher-dashboard">
      <StudioSidebar
        className={navOpen ? "is-open" : ""}
        toggle={
          <button
            className="df-mobile-menu"
            aria-label={navOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={navOpen}
            onClick={() => setNavOpen(!navOpen)}
          >
            {navOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        }
        name={name}
        role="teacher"
        roleLabel="DreamForge administrator"
        caption="DREAMFORGE ADMIN"
        label="Platform administrator sidebar"
        navigation={
          <nav className="df-studio-nav" aria-label="Platform monitoring">
            {tabs.map((t) => (
              <button
                key={t}
                aria-label={t}
                title={t}
                aria-current={section === t ? "page" : undefined}
                onClick={() => {
                  setSection(t);
                  setNavOpen(false);
                  setLimit(50);
                }}
              >
                {(() => {
                  const Icon = icons[t];
                  return <Icon size={20} aria-hidden="true" />;
                })()}
                <span>{t.charAt(0).toUpperCase() + t.slice(1)}</span>
              </button>
            ))}
          </nav>
        }
      />
      <main className="df-page df-teacher-content">
        <header className="df-teacher-header">
          <div>
            <h1>{section.charAt(0).toUpperCase() + section.slice(1)}</h1>
            <p>
              DreamForge platform monitoring across all schools and independent
              accounts.
            </p>
          </div>
        </header>
        <div className="df-container">
          {section === "schools" ? (
            schoolManagement
          ) : section === "projects" ? (
            projects
          ) : (
            <>
              <div className="df-inline">
                <label>
                  Search
                  <input
                    className="df-input"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setLimit(50);
                    }}
                  />
                </label>
                <label>
                  School
                  <select
                    className="df-input"
                    value={school}
                    onChange={(e) => {
                      setSchool(e.target.value);
                      setLimit(50);
                    }}
                  >
                    <option value="all">
                      All schools and independent accounts
                    </option>
                    <option value="independent">Independent accounts</option>
                    {schools.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <span>{rows.length} results</span>
              </div>
              {section === "groups" && (
                <p>
                  Groups are shared projects. Each row shows the owner, members,
                  and student who currently has editing control.
                </p>
              )}
              <StudentReviewTable
                columns={columns[section].length}
                compact={false}
              >
                <thead>
                  <tr>
                    {columns[section].map((c) => (
                      <th key={c} scope="col">
                        {c === "school_admin"
                          ? "School Admin"
                          : c.charAt(0).toUpperCase() + c.slice(1)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, limit).map((r) => (
                    <tr key={r.id}>
                      {columns[section].map((c) => (
                        <td key={c}>
                          {c === "school_admin"
                            ? r[c]
                              ? "Yes"
                              : "No"
                            : String(
                                r[c] || (c === "school" ? "Independent" : "—"),
                              )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </StudentReviewTable>
              {!rows.length && <p>No matching records.</p>}
              {rows.length > limit && (
                <button
                  className="df-button"
                  onClick={() => setLimit(limit + 50)}
                >
                  Show more
                </button>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
