"use client";
import { DreamLoading } from "./dream-loading";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { JoinClassDialog } from "./join-class-dialog";
import { BuilderGreeting } from "./builder-greeting";
import { BuilderIdeaArt } from "./builder-idea-art";
import { BuilderHomePrompt } from "./builder-home-prompt";
import { TeacherPromptGuidance } from "./teacher-prompt-guidance";
import { TeacherProfile } from "./teacher-profile";
import { CopyButton } from "./copy-button";
import { signOut } from "./studio-sidebar";
import { PlatformClassCard } from "./platform-class-card";
import {
  School,
  FolderKanban,
  ShieldCheck,
  UsersRound,
  Link2,
  Clock3,
} from "lucide-react";
import { DreamForgeArt, DreamForgeProjectArt } from "./dreamforge-brand";
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
  initialSection = "home",
}: {
  initialUser?: Data["user"];
  initialSection?: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [link, setLink] = useState(""),
    [guidanceCount, setGuidanceCount] = useState(0),
    [view, setView] = useState(initialSection);
  useEffect(() => {
    setView(initialSection);
  }, [initialSection]);
  function selectSection(section: string) {
    setView(section);
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
    void load();
  }, []);
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
  async function classForm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await action(
      "/api/platform/classes",
      data?.user.role === "teacher"
        ? { name: form.get("code") }
        : { code: form.get("code") },
    );
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
        !teacher && view === "classrooms" ? (
          <JoinClassDialog onJoined={load} />
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
            <section className="df-card df-settings-account">
              <h2>Your account</h2>
              <p className="df-muted">Signed in as {data.user.display_name}.</p>
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
              {teacher && view === "home" && (
                <section className="df-card df-hero">
                  <div className="df-hero-copy">
                    <span className="df-pill df-sticker">
                      {teacher ? "TEACHER STUDIO" : "BUILDER"}
                    </span>
                    <h2 className="df-hero-title">
                      {teacher ? (
                        <>
                          A little guidance.
                          <br />
                          <span className="df-highlight">Big ideas.</span>
                        </>
                      ) : (
                        <>
                          Hey,{" "}
                          <span className="df-highlight">
                            {data.user.display_name}!
                          </span>
                        </>
                      )}
                    </h2>
                    <p style={{ margin: "0 0 24px" }}>
                      {teacher
                        ? "Follow your students’ projects, progress and prompts."
                        : "What will your imagination build today?"}
                    </p>
                    {teacher && (
                      <button
                        className="df-button"
                        onClick={() => selectSection("projects")}
                      >
                        Explore your students’ projects ↗
                      </button>
                    )}
                    {!teacher && (
                      <Link href="/examples" className="df-examples-link">
                        Explore examples ↗
                      </Link>
                    )}
                  </div>
                  <DreamForgeArt />
                </section>
              )}
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
                      Prompts to check
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
                    {data.classes.length === 1 ? "class" : "classes"} · Create a
                    class or share its code
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
                    Explore what your students are making.
                  </p>
                  <footer>Browse projects →</footer>
                </button>
                <button
                  className="df-card df-project"
                  onClick={() => selectSection("prompts")}
                >
                  <span className="df-project-icon">
                    <ShieldCheck size={23} aria-hidden="true" />
                  </span>
                  <h3>Prompt reviews</h3>
                  <p className="df-muted">
                    {guidanceCount} prompts with guidance suggestions
                  </p>
                  <footer>Review prompts →</footer>
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
                <h2>{teacher ? "Your students’ projects" : "Your projects"}</h2>
                <div className="df-inline">
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
                    <Link
                      key={p.vm_id}
                      className="df-card df-project"
                      href={`/${p.vm_id}/${p.metadata.conversations[0]?.id || ""}`}
                    >
                      <DreamForgeProjectArt variant={index} />
                      <h3>{p.metadata.name}</h3>
                      <p className="df-muted">
                        {teacher
                          ? `By ${p.child_name}`
                          : "Built with your imagination"}
                      </p>
                      <footer>
                        {teacher
                          ? "Explore project & history ↗"
                          : "Keep building ↗"}
                      </footer>
                    </Link>
                  ))}
                </div>
              ) : teacher ? (
                <div className="df-empty">
                  Once your students create projects, you’ll see them here.
                </div>
              ) : (
                <div className="df-empty">
                  Your first project will appear here. Start with an idea above.
                </div>
              )}
            </section>
          )}
          {teacher && view === "students" && <TeacherPromptGuidance />}
          {teacher && view === "prompts" && <TeacherPromptGuidance />}
          {view === "classrooms" && (
            <>
              <div className="df-section-head">
                <h2>{teacher ? "Your classrooms" : "Your classes"}</h2>
              </div>
              <div className="df-classroom-entrances">
                {data.classes.map((c) => (
                  <PlatformClassCard
                    key={c.id}
                    classroom={c}
                    teacher={!!teacher}
                    onChanged={load}
                  />
                ))}
              </div>
              {teacher && (
                <form className="df-inline" onSubmit={classForm}>
                  <input
                    aria-label="New class name"
                    className="df-input"
                    name="code"
                    required
                    maxLength={80}
                    placeholder="Name a new class"
                  />
                  <button className="df-button" disabled={busy}>
                    + Create class
                  </button>
                </form>
              )}
            </>
          )}
          {teacher && view === "profile" && (
            <TeacherProfile name={data.user.display_name} onSaved={load} />
          )}
          {!teacher && view === "profile" && (
            <section className="df-card df-profile-usage">
              <div className="df-profile-summary">
                <div>
                  <h2>Your token usage</h2>
                  <p className="df-muted">
                    Confirmed usage from prompts, replies and tool steps.
                  </p>
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
                <p className="df-muted">
                  Create a project to start building. Its token usage will
                  appear here.
                </p>
              )}
            </section>
          )}
          {!teacher && view === "profile" && (
            <section
              className="df-card df-topup-card"
              aria-labelledby="parent-topup-title"
            >
              <div className="df-topup-copy">
                <span className="df-pill">
                  {data.paymentsEnabled ? "PARENT TOP-UPS" : "COMING SOON"}
                </span>
                <h2 id="parent-topup-title">More room for big ideas</h2>
                <p className="df-muted">
                  {data.paymentsEnabled
                    ? "Ask a parent to add tokens. Create a private link, then copy it and share it with them."
                    : "Parent top-ups aren’t available yet. You can keep building with any tokens you have left."}
                </p>
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
            <section className="df-card df-settings-card">
              <span className="df-pill">TEACHER INVITATIONS</span>
              <h2>Invite a teacher</h2>
              <p className="df-muted">
                Create a private invitation link for another teacher. Each link
                can be used once and expires after seven days.
              </p>
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
