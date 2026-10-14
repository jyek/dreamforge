"use client";
import { SimpleLoading } from "./dream-loading";
import { useEffect, useState } from "react";
import Link from "next/link";
import { guidanceCategories, guidanceLabel } from "@/lib/prompt-guidance";
export type GuidanceStudent = {
  id: string;
  display_name: string;
  username: string;
  project_count: number;
  prompt_count: number;
  guidance_count: number;
  categories: Record<string, number>;
};
type Prompt = {
  id: string;
  vm_id: string;
  conversation_id: string;
  project_name: string;
  content: string;
  decision: string;
  created_at: string;
  guidance: string[];
};
async function get(url: string, signal: AbortSignal) {
  const r = await fetch(url, { signal });
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "Unable to load prompts.");
  return data;
}
export function TeacherPromptGuidance({
  initialStudent,
  initialProjectId = "",
}: { initialStudent?: GuidanceStudent; initialProjectId?: string } = {}) {
  const [students, setStudents] = useState<GuidanceStudent[]>([]),
    [selected, setSelected] = useState<GuidanceStudent | null>(
      initialStudent || null,
    ),
    [prompts, setPrompts] = useState<Prompt[]>([]),
    [projects, setProjects] = useState<{ vm_id: string; name: string }[]>([]);
  const [category, setCategory] = useState(""),
    [project, setProject] = useState(initialProjectId),
    [search, setSearch] = useState(""),
    [studentSearch, setStudentSearch] = useState(""),
    [offset, setOffset] = useState(0),
    [hasMore, setHasMore] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const timer = setTimeout(
      () => {
        const params = new URLSearchParams({
          category,
          projectId: project,
          search,
          offset: String(offset),
        });
        if (selected) params.set("studentId", selected.id);
        get(`/api/platform/guidance?${params}`, controller.signal)
          .then((data) => {
            if (selected) {
              setPrompts(data.prompts);
              setProjects(data.projects);
              setHasMore(data.hasMore);
            } else setStudents(data.students);
          })
          .catch((e) => {
            if (e.name !== "AbortError") setError(e.message);
          })
          .finally(() => {
            if (!controller.signal.aborted) setLoading(false);
          });
      },
      search ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [selected, category, project, search, offset]);
  function open(student: GuidanceStudent) {
    setPrompts([]);
    setSelected(student);
    setCategory("");
    setProject("");
    setSearch("");
    setOffset(0);
  }
  const shown = students.filter(
    (s) =>
      `${s.display_name} ${s.username}`
        .toLowerCase()
        .includes(studentSearch.toLowerCase()) &&
      (!category ||
        (category === "any" ? s.guidance_count > 0 : !!s.categories[category])),
  );
  return (
    <section className="df-guidance">
      <div className="df-section-head">
        <h2>
          {selected
            ? `${selected.display_name} · Prompt guidance`
            : "Student prompt overview"}
        </h2>
        {selected && !initialStudent && (
          <button
            className="df-button secondary small"
            onClick={() => {
              setSelected(null);
              setCategory("");
              setSearch("");
              setProject("");
              setOffset(0);
            }}
          >
            ← All students
          </button>
        )}
      </div>
      <p className="df-muted">
        See where students may need guidance. Categories are text-based
        suggestions, not a judgement of the student. Images are not assessed.
      </p>
      {selected && (
        <div className="df-inline df-guidance-summary">
          <span>{selected.project_count} projects</span>
          <span>{selected.prompt_count} prompts</span>
          <span>{selected.guidance_count} prompts with guidance</span>
        </div>
      )}
      <div className="df-guidance-filters">
        <label>
          {selected ? "Search prompts" : "Find a student"}
          <input
            className="df-input"
            placeholder={selected ? "Search prompt text…" : "Name or username…"}
            value={selected ? search : studentSearch}
            onChange={(e) => {
              if (selected) {
                setSearch(e.target.value);
                setOffset(0);
              } else setStudentSearch(e.target.value);
            }}
          />
        </label>
        <label>
          Guidance area
          <select
            className="df-input"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All areas</option>
            <option value="any">Needs guidance</option>
            {Object.entries(guidanceCategories).map(([key, value]) => (
              <option key={key} value={key}>
                {value.label}
              </option>
            ))}
            <option value="other_safety">Other safety concerns</option>
          </select>
        </label>
        {selected && (
          <label>
            Project
            <select
              className="df-input"
              value={project}
              onChange={(e) => {
                setProject(e.target.value);
                setOffset(0);
              }}
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.vm_id} value={p.vm_id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="df-guidance-loading-status">
        {loading && (
          <SimpleLoading
            inline
            label={`Loading ${selected ? "prompts" : "students"}…`}
          />
        )}
      </div>
      {error ? (
        <div role="alert" className="df-empty">
          {error}
        </div>
      ) : (
        <div className="df-card df-guidance-table" aria-busy={loading}>
          <table className="df-table">
            <thead>
              <tr>
                {(selected
                  ? [
                      "Date",
                      "Project",
                      "Prompt",
                      "Guidance area",
                      "How to guide",
                      "Safety check",
                    ]
                  : [
                      "Student",
                      "Projects",
                      "Prompts",
                      "Needs guidance",
                      "Guidance areas",
                      "",
                    ]
                ).map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {selected
                ? prompts.map((p) => (
                    <tr key={p.id}>
                      <td>{new Date(p.created_at).toLocaleString()}</td>
                      <td>
                        <Link
                          className="df-purple"
                          href={`/${p.vm_id}/${p.conversation_id}`}
                        >
                          {p.project_name} ↗
                        </Link>
                      </td>
                      <td className="df-guidance-content">{p.content}</td>
                      <td>
                        {p.guidance.length ? (
                          p.guidance.map((c) => (
                            <span key={c} className="df-guidance-tag">
                              {guidanceLabel(c)}
                            </span>
                          ))
                        ) : (
                          <span className="df-muted">No suggestions</span>
                        )}
                      </td>
                      <td className="df-guidance-tip">
                        {p.guidance.length
                          ? p.guidance.map((c) => (
                              <p key={c}>
                                {guidanceCategories[c]?.tip ||
                                  "Read the prompt in context and help the student choose a safe request."}
                              </p>
                            ))
                          : "Encourage the student to keep experimenting."}
                      </td>
                      <td>
                        {p.decision === "allow"
                          ? "Allowed"
                          : p.decision === "block"
                            ? "Blocked"
                            : "Safety review"}
                      </td>
                    </tr>
                  ))
                : shown.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <button
                          className="df-guidance-student"
                          disabled={loading}
                          onClick={() => open(s)}
                        >
                          <strong>{s.display_name}</strong>
                          <span className="df-muted">@{s.username}</span>
                        </button>
                      </td>
                      <td>{s.project_count}</td>
                      <td>{s.prompt_count}</td>
                      <td>{s.guidance_count}</td>
                      <td>
                        {Object.entries(s.categories).length ? (
                          Object.entries(s.categories).map(([c, n]) => (
                            <span className="df-guidance-tag" key={c}>
                              {guidanceLabel(c)} · {n}
                            </span>
                          ))
                        ) : (
                          <span className="df-muted">No suggestions</span>
                        )}
                      </td>
                      <td>
                        <button
                          className="df-button secondary small"
                          disabled={loading}
                          onClick={() => open(s)}
                        >
                          View prompts →
                        </button>
                      </td>
                    </tr>
                  ))}
              {!loading && !(selected ? prompts.length : shown.length) && (
                <tr>
                  <td colSpan={6}>
                    {selected
                      ? "No prompts match these filters."
                      : "No students match these filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {selected && (
        <div className="df-inline df-guidance-pagination">
          <button
            className="df-button secondary small"
            disabled={loading || !offset}
            onClick={() => setOffset(Math.max(0, offset - 50))}
          >
            Previous
          </button>
          <span>Page {offset / 50 + 1}</span>
          <button
            className="df-button secondary small"
            disabled={loading || !hasMore}
            onClick={() => setOffset(offset + 50)}
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}
