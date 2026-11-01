"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MoreVertical } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { DashboardDetailHeader } from "./dashboard-detail-header";
import { ClassroomAvatar } from "./classroom-avatar";
import { MAX_CLASSROOM_GROUPS } from "@/lib/classroom-group-names";
type Student = {
  id: string;
  display_name: string;
  username: string;
  group_id: string | null;
  alert_count: number;
  pending_count: number;
};
type Group = { id: string; name: string; category: string };
type Project = {
  id: string;
  group_id: string | null;
  name: string;
  owner: string;
  owner_id: string;
  member_ids: string[];
  conversation_id: string | null;
};
export type ClassroomGroupsData = {
  groups: Group[];
  students: Student[];
  projects: Project[];
};
export function ClassroomGroups({ classId }: { classId: string }) {
  const endpoint = `/api/platform/classes/${classId}/groups`;
  const [data, setData] = useState<ClassroomGroupsData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [count, setCount] = useState("4");
  const [manage, setManage] = useState<Group | null>(null);
  const [name, setName] = useState("");
  const [view, setView] = useState<{
    kind: "group" | "student";
    id: string;
  } | null>(null);
  const [dragging, setDragging] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const r = await fetch(endpoint, { cache: "no-store", signal });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || "Could not load classroom groups.");
      setData(d);
    },
    [endpoint],
  );
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setView(null);
    setError("");
    void load(controller.signal).catch((e) => {
      if (e.name !== "AbortError") setError(e.message);
    });
    const timer = setInterval(() => {
      if (document.visibilityState === "visible")
        void load(controller.signal).catch((e) => {
          if (e.name !== "AbortError") setError(e.message);
        });
    }, 10000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [load]);
  async function act(
    body: { action: string; [key: string]: unknown },
    success: string,
  ) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await r.json();
      if (!r.ok) throw Error(result.error || "Could not save groups.");
      if (body.action === "create") setCreateOpen(false);
      if (["rename", "delete"].includes(body.action)) setManage(null);
      await load();
      setNotice(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save groups.");
    } finally {
      setBusy(false);
    }
  }
  const assign = (studentId: string, groupId: string | null) =>
    act({ action: "assign", studentId, groupId }, "Student assignment saved.");
  const projectsFor = (ids: string[]) =>
    data?.projects.filter(
      (p) =>
        ids.includes(p.owner_id) || p.member_ids.some((id) => ids.includes(id)),
    ) || [];
  const activeGroup = data?.groups.find(
    (g) => view?.kind === "group" && g.id === view.id,
  );
  const activeStudent = data?.students.find(
    (s) => view?.kind === "student" && s.id === view.id,
  );
  const members = activeGroup
    ? data!.students.filter((s) => s.group_id === activeGroup.id)
    : [];
  const selectedProjects = activeGroup
    ? data!.projects.filter((p) => p.group_id === activeGroup.id)
    : projectsFor(activeStudent ? [activeStudent.id] : []);
  function studentCard(student: Student) {
    return (
      <li key={student.id} className="df-group-avatar-student">
        <button
          type="button"
          className="df-group-avatar-button"
          draggable={!busy}
          onDragStart={(e) => {
            e.dataTransfer.setData("text/plain", student.id);
            e.dataTransfer.effectAllowed = "move";
            setDragging(student.id);
          }}
          onDragEnd={() => setDragging("")}
          onClick={() => setView({ kind: "student", id: student.id })}
        >
          <ClassroomAvatar identity={student.id} role="student" />
          <strong>{student.display_name}</strong>
        </button>
        {(student.alert_count > 0 || student.pending_count > 0) && (
          <div className="df-group-indicators">
            {student.alert_count > 0 && (
              <Link href={`/students/${student.id}/projects`}>
                {student.alert_count} safety{" "}
                {student.alert_count === 1 ? "alert" : "alerts"}
              </Link>
            )}
            {student.pending_count > 0 && (
              <a className="df-group-pending" href="#safety-report-title">
                {student.pending_count} awaiting approval
              </a>
            )}
          </div>
        )}
        {!!data?.groups.length && (
          <details className="df-group-move-menu">
            <summary>Move to group</summary>
            <label>
              <span className="sr-only">
                Assign {student.display_name} to group
              </span>
              <select
                className="df-input"
                value={student.group_id || ""}
                disabled={busy}
                onChange={(e) =>
                  void assign(student.id, e.target.value || null)
                }
              >
                <option value="">Unassigned</option>
                {data.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          </details>
        )}
      </li>
    );
  }
  function dropArea(groupId: string | null) {
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!busy) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        const id = e.dataTransfer.getData("text/plain");
        setDragging("");
        if (!busy && data?.students.some((s) => s.id === id))
          void assign(id, groupId);
      },
    };
  }
  const remaining = MAX_CLASSROOM_GROUPS - (data?.groups.length || 0);
  return (
    <section
      className="df-classroom-groups"
      aria-labelledby="classroom-groups-title"
      aria-busy={busy}
    >
      <div className="df-section-head">
        <h3 id="classroom-groups-title">
          Students{data ? ` · ${data.students.length}` : ""}
        </h3>
        <button
          className="df-button small"
          disabled={!data || busy}
          onClick={() => {
            setCount(String(Math.min(4, Math.max(1, remaining))));
            setError("");
            setCreateOpen(true);
          }}
        >
          Create groups
        </button>
      </div>
      {notice && <p role="status">{notice}</p>}
      {error && !createOpen && !manage && (
        <p role="alert" className="df-error">
          {error}{" "}
          <button
            className="df-purple"
            onClick={() =>
              void load()
                .then(() => setError(""))
                .catch((e) => setError(e.message))
            }
          >
            Retry
          </button>
        </p>
      )}
      {!data ? (
        !error && <p role="status">Loading classroom groups…</p>
      ) : view && (activeGroup || activeStudent) ? (
        <div>
          <DashboardDetailHeader
            title={`${activeGroup?.name || activeStudent?.display_name} · Projects`}
            back={
              <button
                className="df-button secondary small"
                onClick={() => setView(null)}
              >
                ← Classroom
              </button>
            }
          />
          {activeGroup && (
            <p className="df-muted">
              {members.length} students · {activeGroup.category}
            </p>
          )}
          {activeStudent && (
            <p>
              {activeStudent.alert_count} safety alerts ·{" "}
              {activeStudent.pending_count} awaiting approval ·{" "}
              <Link
                className="df-purple"
                href={`/students/${activeStudent.id}/projects`}
              >
                View student safety and prompts
              </Link>
            </p>
          )}
          {!!members.length && (
            <ul className="df-group-member-links">
              {members.map((s) => (
                <li key={s.id}>
                  <button
                    className="df-purple"
                    onClick={() => setView({ kind: "student", id: s.id })}
                  >
                    {s.display_name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="df-muted">
            {activeGroup
              ? "Projects students have shared with this group."
              : "Projects owned or shared by this student."}
          </p>
          {selectedProjects.length ? (
            selectedProjects.map((p) => (
              <div className="df-school-row" key={p.id}>
                <strong>{p.name || "Untitled project"}</strong>
                <span>{p.owner}</span>
                <Link
                  className="df-button secondary small"
                  href={`/${p.id}${p.conversation_id ? `/${p.conversation_id}` : ""}`}
                >
                  View project
                </Link>
              </div>
            ))
          ) : (
            <p>No projects yet.</p>
          )}
        </div>
      ) : (
        <div className="df-group-grid">
          <article
            className={`df-group-card ${!data.groups.length ? "df-ungrouped-roster" : ""} ${dragging ? "df-group-drop-ready" : ""}`}
            {...dropArea(null)}
          >
            <h4>{data.groups.length ? "Unassigned" : "Students"}</h4>
            <ul>{data.students.filter((s) => !s.group_id).map(studentCard)}</ul>
            {!data.students.some((s) => !s.group_id) && (
              <p className="df-muted">All students assigned.</p>
            )}
          </article>
          {data.groups.map((g) => {
            const students = data.students.filter((s) => s.group_id === g.id);
            return (
              <article
                key={g.id}
                className={`df-group-card ${dragging ? "df-group-drop-ready" : ""}`}
                {...dropArea(g.id)}
              >
                <div className="df-section-head">
                  <button
                    className="df-group-title"
                    onClick={() => setView({ kind: "group", id: g.id })}
                  >
                    {g.name}
                  </button>
                  <button
                    className="df-button secondary small"
                    aria-label={`Manage ${g.name}`}
                    onClick={() => {
                      setManage(g);
                      setName(g.name);
                      setError("");
                    }}
                  >
                    <MoreVertical size={18} />
                  </button>
                </div>
                <small className="df-muted">
                  {students.length}{" "}
                  {students.length === 1 ? "student" : "students"} ·{" "}
                  {data.projects.filter((p) => p.group_id === g.id).length}{" "}
                  group projects
                </small>
                <ul>{students.map(studentCard)}</ul>
                {!students.length && (
                  <p className="df-muted">Drop students here.</p>
                )}
              </article>
            );
          })}
          {!data.groups.length && (
            <p>Create your first groups to start assigning students.</p>
          )}
        </div>
      )}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!busy) setCreateOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create groups</DialogTitle>
            <DialogDescription>
              How many groups would you like to break into?
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (
                !Number.isInteger(Number(count)) ||
                Number(count) < 1 ||
                Number(count) > remaining
              ) {
                setError(
                  `You can create up to ${Math.max(0, remaining)} more groups (20 per classroom).`,
                );
                return;
              }
              void act(
                { action: "create", count: Number(count) },
                "Groups created. Assign students to get started.",
              );
            }}
          >
            <label htmlFor="classroom-group-count">Number of groups</label>
            <input
              autoFocus
              id="classroom-group-count"
              className="df-input"
              type="number"
              min={1}
              step={1}
              required
              value={count}
              onChange={(e) => setCount(e.target.value)}
              disabled={busy}
            />
            {error && (
              <p role="alert" className="df-error">
                {error}
              </p>
            )}
            <div className="df-inline">
              <button
                type="button"
                className="df-button secondary"
                disabled={busy}
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </button>
              <button className="df-button" disabled={busy}>
                {busy ? "Creating…" : "Create groups"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!manage}
        onOpenChange={(open) => {
          if (!open && !busy) setManage(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage {manage?.name}</DialogTitle>
            <DialogDescription>
              Rename this group or delete it to return its students to
              Unassigned. Student projects are preserved.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act(
                { action: "rename", groupId: manage?.id, name },
                "Group renamed.",
              );
            }}
          >
            <label htmlFor="classroom-group-name">Group name</label>
            <input
              autoFocus
              id="classroom-group-name"
              className="df-input"
              value={name}
              maxLength={60}
              required
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
            />
            {error && (
              <p role="alert" className="df-error">
                {error}
              </p>
            )}
            <div className="df-inline">
              <button
                type="button"
                className="df-button secondary"
                disabled={busy}
                onClick={() => setManage(null)}
              >
                Cancel
              </button>
              <button className="df-button" disabled={busy || !name.trim()}>
                Save name
              </button>
              <button
                type="button"
                className="df-button secondary"
                disabled={busy}
                onClick={() =>
                  void act(
                    { action: "delete", groupId: manage?.id },
                    "Group deleted. Students are now unassigned.",
                  )
                }
              >
                Delete group
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
