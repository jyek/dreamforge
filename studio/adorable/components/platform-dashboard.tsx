"use client";
import { TableEmptyState } from "./table-empty-state";
import { DreamLoading } from "./dream-loading";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreateProjectDialog } from "./create-project-dialog";
import { ProjectClassroomSharing } from "./project-classroom-sharing";
import { CreateClassDialog } from "./create-class-dialog";
import { JoinClassDialog } from "./join-class-dialog";
import { BuilderGreeting } from "./builder-greeting";
import { BuilderIdeaArt } from "./builder-idea-art";
import { BuilderHomePrompt } from "./builder-home-prompt";
import { TeacherPromptGuidance } from "./teacher-prompt-guidance";
import { TeacherProfile } from "./teacher-profile";
import { ProfileModuleHeader } from "./profile-module-header";
import { CopyButton } from "./copy-button";
import { signOut } from "./studio-sidebar";
import { PlatformClassCard } from "./platform-class-card";
import { TableEmptyState } from "./table-empty-state";
import {
  School,
  FolderKanban,
  ShieldCheck,
  UsersRound,
  Link2,
  Clock3,
} from "lucide-react";
import { DreamForgeProjectArt } from "./dreamforge-brand";
import { PlatformDashboardLayout } from "./platform-dashboard-layout";
type Project = {
  vm_id: string;
  metadata: { name: string; conversations: { id: string }[] };
  child_name: string;
};
type Wallet = {
  token_limit: string;
  used_tokens: string;
  reserved_tokens: string;
  input_tokens: string;
  output_tokens: string;
};
type Data = {
  user: { display_name: string; role: "child" | "teacher" };
  classes: {
    id: string;
    name: string;
    invite_code?: string;
    teacher_name?: string;
  }[];
  projects: Project[];
  children: ({ id: string; display_name: string; username: string } & Wallet)[];
  wallet: Wallet | null;
  unconfirmed: { id: string; reserved_tokens: string; display_name?: string }[];
  paymentsEnabled: boolean;
  projectUsage: {
    vm_id: string;
    project_name: string;
    used_tokens: string;
    input_tokens: string;
    output_tokens: string;
  }[];
};
async function api(url: string, body?: unknown) {
  const r = await fetch(
    url,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "Something went wrong.");
  return data;
}
export function PlatformDashboard({
  initialUser,
  initialData,
  initialSection = "home",
}: {
  initialUser?: Data["user"];
  initialData?: Data;
  initialSection?: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(initialData || null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [link, setLink] = useState(""),
    [guidanceCount, setGuidanceCount] = useState(0),
    [view, setView] = useState(initialSection);
  useEffect(() => {
    setView(initialSection);
    if (initialData) setData(initialData);
  }, [initialSection, initialData]);
  function selectSection(section: string) {
    router.push(`/${section}`, { scroll: false });
  }
  async function load() {
    try {
      const d = await api("/api/platform/dashboard");
      setData(d);
      if (d.user.role === "teacher") {
        const guidance = await api("/api/platform/guidance");
        setGuidanceCount(
          guidance.students.reduce(
            (total: number, student: { guidance_count: number }) =>
              total + student.guidance_count,
            0,
          ),
        );
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (!initialData) void load();
  }, []);
  useEffect(() => {
    if (!initialData || initialData.user.role !== "teacher" || view !== "home")
      return;
    const controller = new AbortController();
    fetch("/api/platform/guidance", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw Error("Could not load guidance counts.");
        return response.json();
      })
      .then((guidance) =>
        setGuidanceCount(
          guidance.students.reduce(
            (total: number, student: { guidance_count: number }) =>
              total + student.guidance_count,
            0,
          ),
        ),
      )
      .catch((error) => {
        if (error.name !== "AbortError") setError(error.message);
      });
    return () => controller.abort();
  }, [initialData, view]);
  async function action(url: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      const result = await api(url, body);
      if (result.link) setLink(result.link);
      await load();
      return result;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const teacher = (data?.user || initialUser)?.role === "teacher";
  const remaining = data?.wallet
    ? Math.max(
        0,
        Number(data.wallet.token_limit) -
          Number(data.wallet.used_tokens) -
          Number(data.wallet.reserved_tokens),
      )
    : 0;
  return (
    <PlatformDashboardLayout
      teacher={!!teacher}
      remainingTokens={!teacher && data?.wallet ? remaining : undefined}
      name={data?.user.display_name || initialUser?.display_name}
      section={view}
      onSectionChange={selectSection}
      headerAction={
        view === "classrooms" ? (
          teacher ? (
            <CreateClassDialog onCreated={load} />
          ) : (
            <JoinClassDialog onJoined={load} />
          )
        ) : undefined
      }
    >
      {error && (
        <p className="df-error" role="alert">
          {error}
        </p>
      )}
      {!data ? (
        <DreamLoading
          label={
            teacher
              ? "Loading your dashboard…"
              : "Opening your creative corner…"
          }
        />
      ) : (
        <>
          {!teacher && view === "profile" && (
            <section className="df-card df-settings-account df-profile-module">
              <ProfileModuleHeader
                title="Your account"
                description={`Signed in as ${data.user.display_name}.`}
              />
              <button className="df-button secondary" onClick={signOut}>
                Sign out
              </button>
            </section>
          )}
          {!teacher && view === "home" && (
            <section className="df-builder-start" aria-label="Start a project">
              <BuilderIdeaArt />
              <div className="df-builder-start-content">
                <BuilderGreeting name={data.user.display_name} />
                <p>
                  {data.projects.length
                    ? "Dream up a game, an app, or a world of your own. Let’s build it!"
                    : "Your first creation starts with a “what if…” Let’s bring it to life."}
                </p>
                <BuilderHomePrompt empty={!data.projects.length} />
                <Link
                  href="/examples"
                  className="df-examples-link df-builder-examples"
                >
                  Need inspiration? Explore examples ↗
                </Link>
              </div>
              <a href="#builder-projects" className="df-projects-scroll">
                Your projects ↓
              </a>
            </section>
          )}
          {((teacher && view === "home") ||
            (!teacher && view === "profile")) && (
            <>
              {teacher && (
                <div className="df-stats">
                  {" "}
                  <>
                    <div className="df-card df-stat">
                      <UsersRound
                        className="df-stat-icon"
                        size={22}
                        aria-hidden="true"
                      />
                      Students<strong>{data.children.length}</strong>In your
                      roster
                    </div>
                    <div className="df-card df-stat">
                      <FolderKanban
                        className="df-stat-icon"
                        size={22}
                        aria-hidden="true"
                      />
                      Ideas in progress<strong>{data.projects.length}</strong>
                      Projects to explore
                    </div>
                    <div className="df-card df-stat">
                      <ShieldCheck
                        className="df-stat-icon"
                        size={22}
                        aria-hidden="true"
                      />
                      Safety checks
                      <strong>{guidanceCount}</strong>
                      Prompts with guidance suggestions
                    </div>
                  </>
                </div>
              )}
              {teacher && (data.unconfirmed || []).length > 0 && (
                <section
                  className="df-notice df-token-hold"
                  aria-label="Tokens awaiting confirmation"
                >
                  <div className="df-inline">
                    <Clock3 size={18} aria-hidden="true" />
                    <strong>Tokens waiting for confirmation</strong>
                  </div>
                  <p>
                    These AI requests ended without reporting their token usage.{" "}
                    <strong>
                      {data.unconfirmed
                        .reduce(
                          (total, request) =>
                            total + Number(request.reserved_tokens),
                          0,
                        )
                        .toLocaleString()}{" "}
                      tokens
                    </strong>{" "}
                    are temporarily set aside. They aren’t counted as used
                    tokens.
                  </p>
                  {(data.unconfirmed || []).map((r) => (
                    <div
                      className="df-inline"
                      key={r.id}
                      style={{ marginTop: 10 }}
                    >
                      <span>
                        {r.display_name} ·{" "}
                        {Number(r.reserved_tokens).toLocaleString()} tokens held
                      </span>
                      <button
                        disabled={busy}
                        className="df-button secondary small"
                        onClick={() =>
                          action("/api/platform/usage", { id: r.id })
                        }
                      >
                        Release this hold
                      </button>
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
          {teacher && view === "home" && (
            <>
              <div className="df-section-head">
                <h2>Your studio at a glance</h2>
              </div>
              <div className="df-projects df-home-shortcuts">
                <button
                  className="df-card df-project"
                  onClick={() => selectSection("classrooms")}
                >
                  <span className="df-project-icon">
                    <School size={23} aria-hidden="true" />
                  </span>
                  <h3>Classrooms</h3>
                  <p className="df-muted">
                    {data.classes.length}{" "}
                    {data.classes.length === 1 ? "class" : "classes"} · Manage
                    students in your classrooms
                  </p>
                  <footer>Manage classrooms →</footer>
                </button>
                <button
                  className="df-card df-project"
                  onClick={() => selectSection("projects")}
                >
                  <span className="df-project-icon">
                    <FolderKanban size={23} aria-hidden="true" />
                  </span>
                  <h3>Projects</h3>
                  <p className="df-muted">
                    Create projects and share them with your classrooms.
                  </p>
                  <footer>Browse projects →</footer>
                </button>
                <button
                  className="df-card df-project"
                  onClick={() => selectSection("safety")}
                >
                  <span className="df-project-icon">
                    <ShieldCheck size={23} aria-hidden="true" />
                  </span>
                  <h3>Safety</h3>
                  <p className="df-muted">
                    {guidanceCount} prompts with guidance suggestions
                  </p>
                  <footer>Review safety →</footer>
                </button>
              </div>
            </>
          )}
          {(view === "projects" || (!teacher && view === "home")) && (
            <section
              id={!teacher ? "builder-projects" : undefined}
              className={!teacher ? "df-home-project-section" : undefined}
            >
              <div className="df-section-head">
                <h2>{"Your projects"}</h2>
                <div className="df-inline">
                  {teacher && <CreateProjectDialog />}
                  {data.projects.length > 0 && (
                    <span className="df-project-count">
                      {data.projects.length}{" "}
                      {data.projects.length === 1 ? "project" : "projects"}
                    </span>
                  )}
                </div>
              </div>
              {data.projects.length ? (
                <div className="df-projects">
                  {data.projects.map((p, index) => (
                    <article key={p.vm_id} className="df-card df-project">
                      <Link
                        className="df-project-main"
                        href={`/${p.vm_id}/${p.metadata.conversations[0]?.id || ""}`}
                      >
                        <DreamForgeProjectArt variant={index} />
                        <h3>{p.metadata.name}</h3>
                        <p className="df-muted">
                          {teacher
                            ? "Your teaching project"
                            : "Built with your imagination"}
                        </p>
                        <footer>
                          {teacher ? "Open project" : "Keep building ↗"}
                        </footer>
                      </Link>
                      {teacher && (
                        <ProjectClassroomSharing
                          projectId={p.vm_id}
                          name={p.metadata.name}
                        />
                      )}
                    </article>
                  ))}
                </div>
              ) : teacher ? (
                <TableEmptyState
                  framed
                  illustration="projects"
                  title="Make room for your first idea"
                  description="Create a project, then share it with a classroom for your students to explore."
                />
              ) : (
                <TableEmptyState
                  framed
                  illustration="projects"
                  title="Your ideas will live here"
                  description="Start with an idea above. Your games, apps and websites will be waiting here when you come back."
                />
              )}
            </section>
          )}
          {teacher && view === "students" && (
            <TeacherPromptGuidance overviewTitle="Students" />
          )}
          {teacher && view === "safety" && <TeacherPromptGuidance />}
          {view === "classrooms" && (
            <>
              <div
                className={
                  teacher ? "df-teacher-class-grid" : "df-classroom-entrances"
                }
              >
                {data.classes.map((c) => (
                  <PlatformClassCard
                    key={c.id}
                    classroom={c}
                    teacher={!!teacher}
                    onChanged={load}
                  />
                ))}
              </div>
              {!data.classes.length && (
                <TableEmptyState
                  framed
                  illustration="classrooms"
                  title={
                    teacher
                      ? "A space to build together"
                      : "Your classroom adventure starts here"
                  }
                  description={
                    teacher
                      ? "Create your first classroom and invite your students to bring their ideas along."
                      : "Choose Join class and enter the Class Number from your teacher."
                  }
                />
              )}
            </>
          )}
          {teacher && view === "profile" && (
            <TeacherProfile name={data.user.display_name} onSaved={load} />
          )}
          {!teacher && view === "profile" && (
            <section className="df-card df-profile-usage df-profile-module">
              <div className="df-profile-summary">
                <div>
                  <ProfileModuleHeader
                    title="Your token usage"
                    description="Confirmed usage from prompts, replies and tool steps."
                  />
                </div>
                <div>
                  <span>Total tokens used</span>
                  <strong>
                    {Number(data.wallet?.used_tokens || 0).toLocaleString()}
                  </strong>
                </div>
              </div>
              <h3>Usage by project</h3>
              {(data.projectUsage || []).length ? (
                <div className="df-table-scroll">
                  <table className="df-table">
                    <thead>
                      <tr>
                        <th>Project</th>
                        <th>Tokens used</th>
                        <th>Input</th>
                        <th>Output</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.projectUsage.map((project) => (
                        <tr key={project.vm_id}>
                          <td>
                            <Link
                              className="df-purple"
                              href={`/${project.vm_id}`}
                            >
                              {project.project_name}
                            </Link>
                          </td>
                          <td>
                            {Number(project.used_tokens).toLocaleString()}
                          </td>
                          <td>
                            {Number(project.input_tokens).toLocaleString()}
                          </td>
                          <td>
                            {Number(project.output_tokens).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <TableEmptyState
                  illustration="usage"
                  title="A fresh start for your ideas"
                  description="Once you start building, you can see how many tokens each project uses here."
                />
              )}
            </section>
          )}
          {!teacher && view === "profile" && (
            <section
              className="df-card df-topup-card df-profile-module"
              aria-labelledby="parent-topup-title"
            >
              <div className="df-topup-copy">
                <ProfileModuleHeader
                  eyebrow={
                    data.paymentsEnabled ? "PARENT TOP-UPS" : "COMING SOON"
                  }
                  id="parent-topup-title"
                  title="More room for big ideas"
                  description={
                    data.paymentsEnabled
                      ? "Ask a parent to add tokens. Create a private link, then copy it and share it with them."
                      : "Parent top-ups aren’t available yet. You can keep building with any tokens you have left."
                  }
                />
              </div>
              <div className="df-topup-action">
                <button
                  className="df-button"
                  disabled={busy || !data.paymentsEnabled}
                  onClick={() => action("/api/platform/topups", {})}
                >
                  <Link2 size={17} aria-hidden="true" />
                  {busy ? "Creating your link…" : "Get a parent top-up link"}
                </button>
                <p className="df-muted">
                  {data.paymentsEnabled
                    ? "A parent completes the payment using your private link."
                    : "Payments are not available yet."}
                </p>
              </div>
            </section>
          )}
          {teacher && view === "profile" && (
            <section className="df-card df-settings-card df-profile-module">
              <ProfileModuleHeader
                eyebrow="TEACHER INVITATIONS"
                title="Invite a teacher"
                description="Create a private invitation link for another teacher. Each link can be used once and expires after seven days."
              />
              <button
                style={{ marginTop: 16 }}
                className="df-button secondary"
                disabled={busy}
                onClick={() =>
                  action("/api/platform/classes", { action: "inviteTeacher" })
                }
              >
                Invite a teacher
              </button>
            </section>
          )}
          {link && view === "profile" && (
            <div className="df-notice" style={{ marginTop: 20 }}>
              <p style={{ marginTop: 0 }}>Share this link privately:</p>
              <div className="df-inline">
                <input
                  aria-label="Invitation or top-up link"
                  className="df-input"
                  style={{ width: "min(100%,650px)" }}
                  readOnly
                  value={link}
                />
                <CopyButton value={link} className="df-button small">
                  Copy link
                </CopyButton>
              </div>
            </div>
          )}
        </>
      )}
    </PlatformDashboardLayout>
  );
}
