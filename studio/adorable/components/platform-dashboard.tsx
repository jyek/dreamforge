"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { DreamForgeBrand, DreamForgeArt } from "./dreamforge-brand";
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
  classes: { id: string; name: string; invite_code?: string }[];
  projects: Project[];
  children: ({ id: string; display_name: string; username: string } & Wallet)[];
  wallet: Wallet | null;
  unconfirmed: { id: string; reserved_tokens: string; display_name?: string }[];
  paymentsEnabled: boolean;
};
type Review = {
  id: string;
  vm_id: string;
  conversation_id: string;
  content: string;
  decision: string;
  categories: string[];
  severity: string;
  reviewed_at: string | null;
  child_name: string;
  project_name: string;
  created_at: string;
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
export function PlatformDashboard() {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [link, setLink] = useState(""),
    [reviews, setReviews] = useState<Review[]>([]),
    [view, setView] = useState("projects"),
    [reviewCursor, setReviewCursor] = useState<string | null>(null),
    [flagsOnly, setFlagsOnly] = useState(false);
  async function loadReviews(flags = flagsOnly, before?: string) {
    const page = await api(
      `/api/platform/reviews?flags=${flags ? "1" : "0"}${before ? `&before=${encodeURIComponent(before)}` : ""}`,
    );
    setReviews((old) => (before ? [...old, ...page.reviews] : page.reviews));
    setReviewCursor(page.nextCursor);
  }
  async function load() {
    try {
      const d = await api("/api/platform/dashboard");
      setData(d);
      if (d.user.role === "teacher") await loadReviews();
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
  async function createProject() {
    const result = await action("/api/projects", { name: "My new idea" });
    if (result?.id)
      window.location.assign(`/${result.id}/${result.conversationId}`);
  }
  const teacher = data?.user.role === "teacher";
  const remaining = data?.wallet
    ? Math.max(
        0,
        Number(data.wallet.token_limit) -
          Number(data.wallet.used_tokens) -
          Number(data.wallet.reserved_tokens),
      )
    : 0;
  return (
    <main className="df-page">
      <header className="df-header">
        <DreamForgeBrand />
        <nav className="df-nav">
          <Link href="/examples">Examples</Link>
          <button
            className="df-button secondary small"
            onClick={async () => {
              await fetch("/api/platform/auth", { method: "DELETE" });
              window.location.assign("/login");
            }}
          >
            Sign out
          </button>
        </nav>
      </header>
      <div className="df-container">
        {error && (
          <p className="df-error" role="alert">
            {error}
          </p>
        )}
        {!data ? (
          <div className="df-empty">Opening your creative corner…</div>
        ) : (
          <>
            <section className="df-card df-hero">
              <div>
                <span className="df-pill">
                  {teacher ? "TEACHER STUDIO" : "DREAM BUILDER"}
                </span>
                <h1>
                  {teacher
                    ? "A little guidance. Big ideas."
                    : `Hey, ${data.user.display_name}!`}
                </h1>
                <p style={{ margin: "0 0 24px" }}>
                  {teacher
                    ? "Follow your class’s creations, progress and prompts."
                    : "What will your imagination build today?"}
                </p>
                {!teacher && (
                  <button
                    className="df-button"
                    disabled={busy}
                    onClick={createProject}
                  >
                    {busy ? "Preparing your workspace…" : "+ Create a project"}
                  </button>
                )}
              </div>
              <DreamForgeArt />
            </section>
            <div className="df-stats">
              {teacher ? (
                <>
                  <div className="df-card df-stat">
                    Dream builders<strong>{data.children.length}</strong>Across
                    your classes
                  </div>
                  <div className="df-card df-stat">
                    Ideas in progress<strong>{data.projects.length}</strong>
                    Projects to explore
                  </div>
                  <div className="df-card df-stat">
                    Prompts to check
                    <strong>
                      {
                        reviews.filter(
                          (r) => r.decision !== "allow" && !r.reviewed_at,
                        ).length
                      }
                    </strong>
                    Unreviewed safety flags
                  </div>
                </>
              ) : (
                <>
                  <div className="df-card df-stat">
                    Tokens remaining
                    <strong>{remaining.toLocaleString()}</strong>From your token
                    allowance
                  </div>
                  <div className="df-card df-stat">
                    Tokens used
                    <strong>
                      {Number(data.wallet?.used_tokens || 0).toLocaleString()}
                    </strong>
                    Includes prompts, replies & tools
                  </div>
                  <div className="df-card df-stat">
                    Your creations<strong>{data.projects.length}</strong>Every
                    idea starts somewhere
                  </div>
                </>
              )}
            </div>
            {(data.unconfirmed || []).length > 0 && (
              <section className="df-notice" style={{ marginBottom: 25 }}>
                <strong>Unconfirmed AI requests</strong>
                <p>
                  These requests did not return confirmed token usage. Their
                  allowance is held separately from tokens used.
                </p>
                {teacher ? (
                  (data.unconfirmed || []).map((r) => (
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
                  ))
                ) : (
                  <p>
                    Ask your teacher to review and release the hold before
                    trying again.
                  </p>
                )}
              </section>
            )}
            {teacher && (
              <div className="df-inline">
                {["projects", "builders", "prompts"].map((v) => (
                  <button
                    key={v}
                    className={`df-button ${view === v ? "" : "secondary"}`}
                    onClick={() => setView(v)}
                  >
                    {v === "projects"
                      ? "Projects"
                      : v === "builders"
                        ? "Dream builders"
                        : "Prompt reviews"}
                  </button>
                ))}
              </div>
            )}
            {view === "projects" && (
              <>
                <div className="df-section-head">
                  <h2>
                    {teacher
                      ? "Your class’s projects"
                      : "Your little masterpieces"}
                  </h2>
                  <span className="df-pill">
                    {data.projects.length} projects
                  </span>
                </div>
                {data.projects.length ? (
                  <div className="df-projects">
                    {data.projects.map((p) => (
                      <Link
                        key={p.vm_id}
                        className="df-card df-project"
                        href={`/${p.vm_id}/${p.metadata.conversations[0]?.id || ""}`}
                      >
                        <span className="df-project-icon">✧</span>
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
                ) : (
                  <div className="df-empty">
                    {teacher
                      ? "Once your builders create projects, you’ll see them here."
                      : "Your first creation is waiting. Start with an idea!"}
                  </div>
                )}
              </>
            )}
            {teacher && view === "builders" && (
              <section
                className="df-card"
                style={{ marginTop: 24, overflowX: "auto" }}
              >
                <table className="df-table">
                  <thead>
                    <tr>
                      <th>Builder</th>
                      <th>Tokens used</th>
                      <th>Remaining</th>
                      <th>Input / output</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.children.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <strong>{c.display_name}</strong>
                          <br />@{c.username}
                        </td>
                        <td>{Number(c.used_tokens).toLocaleString()}</td>
                        <td>
                          {Math.max(
                            0,
                            Number(c.token_limit) -
                              Number(c.used_tokens) -
                              Number(c.reserved_tokens),
                          ).toLocaleString()}
                        </td>
                        <td>
                          {Number(c.input_tokens).toLocaleString()} /{" "}
                          {Number(c.output_tokens).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
            {teacher && view === "prompts" && (
              <>
                <div className="df-section-head">
                  <h2>Every prompt, in view</h2>
                  <label className="df-inline">
                    <input
                      type="checkbox"
                      checked={flagsOnly}
                      onChange={async (e) => {
                        const next = e.target.checked;
                        setFlagsOnly(next);
                        try {
                          await loadReviews(next);
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    />
                    Flagged prompts only
                  </label>
                </div>
                <p className="df-muted">
                  Local text checks flag patterns for review. Marking a prompt
                  reviewed does not override a blocked request. Image content is
                  not covered by these text checks.
                </p>
                {reviews.length ? (
                  reviews.map((r) => (
                    <article
                      key={r.id}
                      className={`df-card df-review ${r.decision === "allow" ? "safe" : "flagged"}`}
                    >
                      <div className="df-inline">
                        <strong>{r.child_name}</strong>
                        <span className="df-pill">
                          {r.decision === "allow"
                            ? "No text flags"
                            : `${r.decision} · ${r.severity}`}
                        </span>
                        <Link
                          className="df-purple"
                          href={`/${r.vm_id}/${r.conversation_id}`}
                        >
                          {r.project_name} ↗
                        </Link>
                      </div>
                      <p>{r.content}</p>
                      <div className="df-inline">
                        <small>
                          {r.categories.join(", ") || "No categories flagged"} ·{" "}
                          {new Date(r.created_at).toLocaleString()}
                        </small>
                        {r.reviewed_at ? (
                          <span className="df-pill">Reviewed</span>
                        ) : (
                          <button
                            className="df-button secondary small"
                            onClick={() =>
                              action("/api/platform/reviews", { id: r.id })
                            }
                          >
                            Mark reviewed
                          </button>
                        )}
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="df-empty">No prompts found.</div>
                )}
                {reviewCursor && (
                  <button
                    className="df-button secondary"
                    onClick={() =>
                      loadReviews(flagsOnly, reviewCursor).catch((e) =>
                        setError(e.message),
                      )
                    }
                  >
                    Load older prompts
                  </button>
                )}
              </>
            )}
            <div className="df-section-head">
              <h2>{teacher ? "Your classrooms" : "Your classes"}</h2>
            </div>
            <div className="df-inline" style={{ marginBottom: 20 }}>
              {data.classes.map((c) => (
                <div className="df-card" key={c.id}>
                  <strong>{c.name}</strong>
                  {c.invite_code && (
                    <>
                      <p className="df-muted" style={{ fontSize: 12 }}>
                        Class invitation code
                      </p>
                      <button
                        className="df-button secondary small"
                        onClick={() =>
                          navigator.clipboard.writeText(c.invite_code!)
                        }
                      >
                        {c.invite_code} ⧉
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
            <form className="df-inline" onSubmit={classForm}>
              <input
                aria-label={
                  teacher ? "New class name" : "Class invitation code"
                }
                className="df-input"
                name="code"
                required
                maxLength={80}
                placeholder={
                  teacher ? "Name a new class" : "Enter a class invitation code"
                }
              />
              <button className="df-button secondary" disabled={busy}>
                {teacher ? "+ Create class" : "Join another class"}
              </button>
            </form>
            {!teacher && (
              <section
                className="df-card"
                style={{ marginTop: 35, background: "#F4EEFF" }}
              >
                <h2 style={{ marginTop: 0 }}>More room for big ideas</h2>
                <p className="df-muted">
                  Ask a parent to add tokens. Copy a private top-up link and
                  share it with them yourself.
                </p>
                <button
                  className="df-button"
                  disabled={busy}
                  onClick={() => action("/api/platform/topups", {})}
                >
                  Get a parent top-up link ⧉
                </button>
                {!data.paymentsEnabled && (
                  <p style={{ fontSize: 12 }} className="df-muted">
                    Payment setup is in progress. No purchases can be made yet.
                  </p>
                )}
              </section>
            )}
            {teacher && (
              <button
                style={{ marginTop: 25 }}
                className="df-button secondary"
                disabled={busy}
                onClick={() =>
                  action("/api/platform/classes", { action: "inviteTeacher" })
                }
              >
                Invite a teacher
              </button>
            )}
            {link && (
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
                  <button
                    className="df-button small"
                    onClick={() => navigator.clipboard.writeText(link)}
                  >
                    Copy link
                  </button>
                </div>
              </div>
            )}
            <p className="df-footer">
              Made for curious minds. 100,000 starter tokens · Teacher-guided
              learning
            </p>
          </>
        )}
      </div>
    </main>
  );
}
