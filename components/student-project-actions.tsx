"use client";
import { useState, useEffect, useRef } from "react";
import { EllipsisVertical } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { ProjectRename } from "./assistant-ui/project-rename";
import { ProjectClassroomSharing } from "./project-classroom-sharing";
type Classroom = { id: string; name: string; attached: boolean };
type Group = { id: string; name: string; class_id: string };
export function StudentProjectActions({
  projectId,
  name,
  description,
  canMakeGroup = false,
  onChanged,
}: {
  projectId: string;
  name: string;
  description?: string;
  canMakeGroup?: boolean;
  onChanged?: () => Promise<void>;
}) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node))
        menuRef.current.open = false;
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && menuRef.current)
        menuRef.current.open = false;
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  const [open, setOpen] = useState(false),
    [classes, setClasses] = useState<Classroom[]>([]),
    [groups, setGroups] = useState<Group[]>([]),
    [groupId, setGroupId] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function load() {
    setOpen(true);
    setLoading(true);
    setError("");
    setGroupId("");
    try {
      const r = await fetch(`/api/projects/${projectId}/classrooms`, {
          cache: "no-store",
        }),
        d = await r.json();
      if (!r.ok) throw Error(d.error);
      setClasses(d.classes);
      setGroups(d.groups);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  const choices = groups.filter((g) =>
    classes.some((c) => c.id === g.class_id && c.attached),
  );
  async function share() {
    const group = choices.find((g) => g.id === groupId);
    if (!group) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/platform/classes/${group.class_id}/groups`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, groupId }),
        }),
        d = await r.json();
      if (!r.ok) throw Error(d.error);
      await onChanged?.();
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <details ref={menuRef} className="df-student-project-actions">
        <summary aria-label={`Actions for ${name}`}>
          <EllipsisVertical size={20} />
        </summary>
        <div className="df-student-project-menu">
          <ProjectRename
            projectId={projectId}
            name={name}
            description={description}
            editDescription
            onRenamed={() => void onChanged?.()}
            className="df-button secondary small"
          />
          <ProjectClassroomSharing
            projectId={projectId}
            name={name}
            student
            onChanged={onChanged}
          />
          {canMakeGroup && (
            <button
              type="button"
              className="df-button secondary small"
              onClick={() => void load()}
            >
              Make group project
            </button>
          )}
        </div>
      </details>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!busy) setOpen(v);
        }}
      >
        <DialogContent className="df-card df-form">
          <DialogTitle>Make {name} a group project</DialogTitle>
          <DialogDescription>
            Choose your group in an assigned classroom. Members of that group
            can edit this project and hand over control to each other.
          </DialogDescription>
          {loading ? (
            <p role="status">Loading…</p>
          ) : choices.length ? (
            <label>
              Classroom and group
              <select
                className="df-input"
                value={groupId}
                disabled={busy}
                onChange={(e) => setGroupId(e.target.value)}
              >
                <option value="">Choose a group</option>
                {choices.map((g) => (
                  <option key={g.id} value={g.id}>
                    {classes.find((c) => c.id === g.class_id)?.name} · {g.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            !error && (
              <p>
                Assign this project to a classroom first, and ask your teacher
                to add you to a group in that classroom.
              </p>
            )
          )}
          {error && (
            <p role="alert" className="df-error">
              {error}
            </p>
          )}
          <div className="df-inline" style={{ justifyContent: "flex-end" }}>
            <button
              type="button"
              className="df-button secondary"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="df-button"
              disabled={busy || loading || !groupId}
              onClick={() => void share()}
            >
              {busy ? "Saving…" : "Make group project"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
