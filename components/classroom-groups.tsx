"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ClassProjectAssignments,
  type AssignableProject,
} from "./class-project-assignments";
import { StatusToast } from "./status-toast";
import { MoreVertical } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { DashboardDetailHeader } from "./dashboard-detail-header";
import { ClassroomSectionHeader } from "./classroom-section-header";
import { ClassroomProjectFilter } from "./classroom-project-filter";
import { StudentReviewTable } from "./student-review-table";
import { ClassroomPeople } from "./classroom-people";
import { ClassroomAvatar } from "./classroom-avatar";
import { MAX_CLASSROOM_GROUPS } from "@/lib/classroom-group-names";
type Student = {
  id: string;
  display_name: string;
  username: string;
  group_id: string | null;
  is_group_project?: boolean;
  alert_count: number;
  pending_count: number;
};
type Group = { id: string; name: string; category: string };
type Project = {
  id: string;
  group_id: string | null;
  is_group_project?: boolean;
  name: string;
  owner: string;
  owner_id: string;
  owner_role?: string;
  member_ids: string[];
  conversation_id: string | null;
};
export type ClassroomGroupsData = {
  groups: Group[];
  students: Student[];
  projects: Project[];
  classroomProjects?: (Project & { group_name?: string | null })[];
};
export function ClassroomGroups({
  classId,
  availableProjects,
  onProjectsChanged,
}: {
  classId: string;
  availableProjects?: AssignableProject[];
  onProjectsChanged?: () => Promise<void>;
}) {
  const router = useRouter();
  const [projectOwner, setProjectOwner] = useState("");
  const endpoint = `/api/platform/classes/${classId}/groups`;
  const [data, setData] = useState<ClassroomGroupsData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [count, setCount] = useState("4");
  const [newGroupName, setNewGroupName] = useState("");
  const [addingSingle, setAddingSingle] = useState(false);
  const [manage, setManage] = useState<Group | null>(null);
  const [manageAction, setManageAction] = useState<"rename" | "delete">(
    "rename",
  );
  const [name, setName] = useState("");
  const [view, setView] = useState<{
    kind: "group";
    id: string;
  } | null>(null);
  const [dragging, setDragging] = useState("");
  const [notice, setNotice] = useState("");
  const dismissNotice = useCallback(() => setNotice(""), []);
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
  const activeGroup = data?.groups.find(
    (g) => view?.kind === "group" && g.id === view.id,
  );
  const members = activeGroup
    ? data!.students.filter((s) => s.group_id === activeGroup.id)
    : [];
  const selectedProjects = activeGroup
    ? data!.projects.filter((p) => p.group_id === activeGroup.id)
    : [];
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
          onClick={() => router.push(`/students/${student.id}/projects`)}
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
              <Link
                className="df-group-pending"
                href={`/students/${student.id}/projects`}
              >
                {student.pending_count} awaiting approval
              </Link>
            )}
          </div>
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
      <ClassroomSectionHeader
        id="classroom-groups-title"
        title={<>Students{data ? ` · ${data.students.length}` : ""}</>}
        action={
          <button
            className="df-button secondary small"
            disabled={!data || busy}
            onClick={() => {
              setAddingSingle(!!data?.groups.length);
              setNewGroupName("");
              setCount(String(Math.min(4, Math.max(1, remaining))));
              setError("");
              setCreateOpen(true);
            }}
          >
            {data?.groups.length ? "Add group" : "Create Groups"}
          </button>
        }
      />

      <StatusToast message={notice} onDismiss={dismissNotice} />
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
        !error && <ClassroomPeople people={[]} role="student" loading />
      ) : view && activeGroup ? (
        <div>
          <DashboardDetailHeader
            title={`${activeGroup.name} · Projects`}
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
          {!!members.length && (
            <ul className="df-group-member-links">
              {members.map((s) => (
                <li key={s.id}>
                  <button
                    className="df-purple"
                    onClick={() => router.push(`/students/${s.id}/projects`)}
                  >
                    {s.display_name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="df-muted">
            Projects students have shared with this group.
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
            className={`df-group-card df-ungrouped-roster ${dragging ? "df-group-drop-ready" : ""}`}
            aria-label="Students without a group"
            {...dropArea(null)}
          >
            <ul>{data.students.filter((s) => !s.group_id).map(studentCard)}</ul>
            {dragging && !data.students.some((s) => !s.group_id) && (
              <p className="df-muted">Drop students here.</p>
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
                <div className="df-group-card-header">
                  <div className="df-group-card-heading">
                    <button
                      className="df-group-title"
                      onClick={() => setView({ kind: "group", id: g.id })}
                    >
                      {g.name}
                    </button>
                    <small className="df-muted">
                      {students.length}{" "}
                      {students.length === 1 ? "student" : "students"} ·{" "}
                      {data.projects.filter((p) => p.group_id === g.id).length}{" "}
                      group projects
                    </small>
                  </div>
                  <details className="df-group-action-menu">
                    <summary
                      className="df-group-menu-button"
                      aria-label={`Actions for ${g.name}`}
                    >
                      <MoreVertical size={18} />
                    </summary>
                    <div className="df-group-action-options">
                      {(["rename", "delete"] as const).map((action) => (
                        <button
                          type="button"
                          key={action}
                          disabled={busy}
                          onClick={(e) => {
                            const menu = e.currentTarget.closest("details");
                            if (menu) menu.open = false;
                            setManage(g);
                            setManageAction(action);
                            setName(g.name);
                            setError("");
                          }}
                        >
                          {action === "rename"
                            ? "Rename Group"
                            : "Remove Group"}
                        </button>
                      ))}
                    </div>
                  </details>
                </div>

                <ul>{students.map(studentCard)}</ul>
                {!students.length && (
                  <p className="df-muted">Drop students here.</p>
                )}
              </article>
            );
          })}
        </div>
      )}
      {!view && (
        <section
          className="df-classroom-project-list"
          aria-labelledby="classroom-projects-title"
        >
          <ClassroomSectionHeader
            id="classroom-projects-title"
            title="Projects"
          />
          <ClassroomProjectFilter
            people={Array.from(
              new Map(
                (data?.classroomProjects || []).map((p) => [
                  p.owner_id,
                  {
                    id: p.owner_id,
                    name: p.owner,
                    role: (p.owner_role === "teacher"
                      ? "teacher"
                      : "student") as "teacher" | "student",
                  },
                ]),
              ).values(),
            )}
            value={projectOwner}
            onChange={setProjectOwner}
            action={
              availableProjects && (
                <ClassProjectAssignments
                  classId={classId}
                  projects={availableProjects}
                  onChanged={async () => {
                    await onProjectsChanged?.();
                    await load();
                  }}
                />
              )
            }
          />
          <StudentReviewTable
            busy={!data && !error}
            columns={4}
            loadingLabel="Loading…"
            compact={false}
            empty={!!data && !data.classroomProjects?.length}
          >
            <thead>
              <tr>
                <th>Project</th>
                <th>Created by</th>
                <th>Group</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data?.classroomProjects || [])
                .filter((p) => !projectOwner || p.owner_id === projectOwner)
                .map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name || "Untitled project"}</strong>
                    </td>
                    <td>{p.owner}</td>
                    <td>
                      {p.group_name ? (
                        <span className="df-guidance-tag">{p.group_name}</span>
                      ) : (
                        <span className="df-muted">
                          {p.is_group_project
                            ? "Group project · Unassigned"
                            : "Individual project"}
                        </span>
                      )}
                    </td>
                    <td>
                      <Link
                        className="df-button secondary small"
                        href={`/${p.id}${p.conversation_id ? `/${p.conversation_id}` : ""}`}
                      >
                        View project
                      </Link>
                    </td>
                  </tr>
                ))}
              {data &&
                !data.classroomProjects?.some(
                  (p) => !projectOwner || p.owner_id === projectOwner,
                ) && (
                  <tr>
                    <td colSpan={4}>
                      No projects assigned to this classroom yet.
                    </td>
                  </tr>
                )}
            </tbody>
          </StudentReviewTable>
        </section>
      )}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!busy) setCreateOpen(open);
        }}
      >
        <DialogContent className="df-group-create-dialog">
          <DialogHeader>
            <DialogTitle>
              {addingSingle ? "Add group" : "Create Groups"}
            </DialogTitle>
            <DialogDescription>
              {addingSingle
                ? "Enter a name for the new group."
                : "How many groups would you like to break into?"}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (addingSingle) {
                if (remaining < 1) {
                  setError("A classroom can have up to 20 groups.");
                  return;
                }
                void act(
                  { action: "create", count: 1, name: newGroupName.trim() },
                  "Group added.",
                );
                return;
              }
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
            {addingSingle ? (
              <div className="df-group-name-field">
                <label htmlFor="new-classroom-group-name">Group name</label>
                <input
                  autoFocus
                  id="new-classroom-group-name"
                  className="df-input"
                  value={newGroupName}
                  maxLength={60}
                  required
                  disabled={busy}
                  onChange={(e) => setNewGroupName(e.target.value)}
                />
              </div>
            ) : (
              <>
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
              </>
            )}
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
                {busy
                  ? "Creating…"
                  : addingSingle
                    ? "Add group"
                    : "Create Groups"}
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
        <DialogContent className="df-group-manage-dialog">
          <DialogHeader>
            <DialogTitle>
              {manageAction === "rename" ? "Rename Group" : "Remove Group"}
            </DialogTitle>
            <DialogDescription>
              {manageAction === "rename"
                ? "Choose a new name for this group."
                : `Remove ${manage?.name}? Students will return to Unassigned. Group projects stay in the classroom. Only the student owner can access them until shared with a group again.`}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act(
                {
                  action: manageAction,
                  groupId: manage?.id,
                  ...(manageAction === "rename" ? { name } : {}),
                },
                manageAction === "rename"
                  ? "Group renamed."
                  : "Group removed. Students are now unassigned.",
              );
            }}
          >
            {manageAction === "rename" && (
              <div className="df-group-name-field">
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
              </div>
            )}
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
              <button
                className="df-button"
                disabled={busy || (manageAction === "rename" && !name.trim())}
              >
                {busy
                  ? "Saving…"
                  : manageAction === "rename"
                    ? "Rename"
                    : "Remove Group"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
