"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ExternalLink, Eye, EyeOff } from "lucide-react";
import { DreamForgeBrand } from "./dreamforge-brand";
import { InlineSpinner } from "./dream-loading";
import type { AdminProject } from "@/lib/admin-showcase";
import styles from "./admin-showcase.module.css";
export function AdminSignOut({ label = "Sign out" }: { label?: string }) {
  return (
    <button
      className={styles.button}
      onClick={async () => {
        await fetch("/api/platform/auth", { method: "DELETE" });
        window.location.assign("/admin");
      }}
    >
      {label}
    </button>
  );
}
export function AdminAccessDenied({ name }: { name: string }) {
  return (
    <main className={styles.restricted}>
      <span className={styles.badge}>Site administration</span>
      <h1>Administrator access required</h1>
      <p className={styles.muted}>
        You’re signed in as {name}. This account does not have access to the
        admin panel.
      </p>
      <div className={styles.actions}>
        <Link href="/home" className={styles.button}>
          Back to your studio
        </Link>
        <AdminSignOut label="Use another account" />
      </div>
    </main>
  );
}
export function AdminShowcase({
  initialProjects,
  name,
}: {
  initialProjects: AdminProject[];
  name: string;
}) {
  const [projects, setProjects] = useState(initialProjects),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const shown = projects
    .filter((p) => p.featured)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  async function update(
    body: object,
    key: string,
    message: string,
    optimistic?: AdminProject[],
  ) {
    const previous = projects;
    setBusy(key);
    setError("");
    setStatus(message);
    if (optimistic) setProjects(optimistic);
    try {
      const r = await fetch("/api/admin/showcase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error || "The change could not be saved.");
      setProjects(data.projects);
      setStatus("Saved. The examples gallery is up to date.");
    } catch (e) {
      if (optimistic) setProjects(previous);
      setError((e as Error).message);
      setStatus("");
    } finally {
      setBusy("");
    }
  }
  const toggle = (p: AdminProject) =>
    update(
      { action: p.featured ? "hide" : "feature", projectId: p.id },
      p.id,
      p.featured ? "Removing this example…" : "Updating the examples gallery…",
    );
  function move(index: number, direction: number) {
    const next = [...shown];
    [next[index], next[index + direction]] = [
      next[index + direction],
      next[index],
    ];
    const ids = next.map((p) => p.exampleId!);
    void update(
      { action: "reorder", projectIds: ids },
      "order",
      "Saving example order…",
      projects.map((p) =>
        p.featured ? { ...p, order: ids.indexOf(p.exampleId!) + 1 } : p,
      ),
    );
  }
  const filtered = projects.filter((p) =>
    (p.name + " " + p.owner).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.actions}>
          <DreamForgeBrand />
          <span className={styles.badge}>Admin</span>
        </div>
        <div className={styles.actions}>
          <span className={styles.muted}>Signed in as {name}</span>
          <Link href="/examples" target="_blank" className={styles.button}>
            View examples <ExternalLink size={14} />
          </Link>
          <AdminSignOut />
        </div>
      </header>
      <div className={styles.heading}>
        <div>
          <h1>Choose what inspires.</h1>
          <p>
            Tag personal projects to show their live preview in the public
            gallery. They stay editable in the owner’s studio, and conversations
            stay private. Edits to a showcased project update its public
            preview.
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div role="status" aria-live="polite" className={styles.status}>
        {busy && <InlineSpinner className="mr-2 inline size-3" />}
        {status}
      </div>
      <section className={styles.section} aria-labelledby="showcased-heading">
        <div className={styles.sectionHead}>
          <div>
            <h2 id="showcased-heading">
              Showcased projects{" "}
              <span className={styles.muted}>({shown.length})</span>
            </h2>
            <p>Shown in this order. Changes save automatically.</p>
          </div>
        </div>
        {shown.length ? (
          <div>
            {shown.map((p, index) => (
              <div key={p.id} className={styles.featured}>
                <div className={styles.order}>
                  <span className={styles.number}>{index + 1}</span>
                  <div>
                    <span className={styles.name}>{p.name}</span>
                    <div className={styles.muted}>
                      {p.description || "Read-only example"}
                    </div>
                  </div>
                </div>
                <div className={styles.actions}>
                  <button
                    disabled={!!busy || index === 0}
                    className={styles.button}
                    aria-label={"Move " + p.name + " up"}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp size={15} />
                  </button>
                  <button
                    disabled={!!busy || index === shown.length - 1}
                    className={styles.button}
                    aria-label={"Move " + p.name + " down"}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown size={15} />
                  </button>
                  <button
                    disabled={!!busy}
                    className={styles.button}
                    aria-label={"Hide " + p.name}
                    onClick={() => toggle(p)}
                  >
                    <EyeOff size={15} />
                    Hide
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.empty}>
            No projects are showcased yet. Choose one below to get started.
          </p>
        )}
      </section>
      <section
        className={styles.section}
        aria-labelledby="all-projects-heading"
      >
        <div className={styles.sectionHead}>
          <div>
            <h2 id="all-projects-heading">Project library</h2>
            <p>Preview a project before adding it to the showcase.</p>
          </div>
          <input
            className={styles.search}
            aria-label="Search projects"
            placeholder="Search projects or owners…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Project</th>
                <th>Owner</th>
                <th>Examples gallery</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className={styles.name}>{p.name}</div>
                    <div className={styles.muted}>
                      {p.owned
                        ? "Personal project · live preview"
                        : "Example library"}
                    </div>
                    <a
                      className={styles.preview}
                      href={"/api/admin/projects/" + p.id + "/preview"}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Preview project ↗
                    </a>
                  </td>
                  <td>{p.owner}</td>
                  <td>
                    <button
                      disabled={!!busy}
                      aria-label={(p.featured ? "Hide " : "Show ") + p.name}
                      aria-pressed={p.featured}
                      className={`${styles.button} ${p.featured ? styles.selected : styles.primary}`}
                      onClick={() => toggle(p)}
                    >
                      {busy === p.id ? (
                        <InlineSpinner className="size-3" />
                      ) : p.featured ? (
                        <Eye size={15} />
                      ) : null}
                      {p.featured ? "Shown" : "Show"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && (
          <p className={styles.empty}>No projects match your search.</p>
        )}
      </section>
    </main>
  );
}
