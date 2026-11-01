"use client";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
} from "./ui/dialog";
export function ProjectClassroomSharing({
  projectId,
  name,
  student = false,
  onChanged,
}: {
  projectId: string;
  name: string;
  student?: boolean;
  onChanged?: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [classes, setClasses] = useState<
      { id: string; name: string; attached: boolean }[] | null
    >(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false);
  async function load() {
    if (loading || busy) return;
    setLoading(true);
    setError("");
    setClasses(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/classrooms`, {
          cache: "no-store",
        }),
        d = await r.json();
      if (!r.ok) throw Error(d.error);
      setClasses(d.classes);
      setOpen(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/projects/${projectId}/classrooms`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            classIds: classes?.filter((c) => c.attached).map((c) => c.id) || [],
          }),
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
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (busy) return;
        if (value) void load();
        else setOpen(false);
      }}
    >
      <DialogTrigger asChild>
        <button
          className="df-button secondary small"
          disabled={loading || busy}
          aria-busy={loading}
        >
          {loading
            ? "Loading…"
            : student
              ? "Assign to classroom"
              : "Share with classrooms"}
        </button>
      </DialogTrigger>
      {!open && error && (
        <p role="alert" className="df-error">
          {error}
        </p>
      )}
      <DialogContent className="df-card">
        <DialogTitle>Share {name}</DialogTitle>
        <DialogDescription>
          {student
            ? "Choose the classrooms for this project. You can assign it to more than one classroom."
            : "Choose the classrooms that can view this project. Students can explore it, but cannot edit your copy."}
        </DialogDescription>
        {classes?.length === 0 && (
          <p>
            {student
              ? "Join a classroom first to assign your project."
              : "Create a classroom first to share your project."}
          </p>
        )}
        <div className="df-form">
          {classes?.map((c) => (
            <label key={c.id} className="df-assignment-option">
              <input
                type="checkbox"
                checked={c.attached}
                disabled={busy}
                onChange={(e) =>
                  setClasses(
                    classes.map((item) =>
                      item.id === c.id
                        ? { ...item, attached: e.target.checked }
                        : item,
                    ),
                  )
                }
              />
              <span>{c.name}</span>
            </label>
          ))}
        </div>
        {error && (
          <p role="alert" className="df-error">
            {error}
          </p>
        )}
        <DialogFooter>
          <button
            type="button"
            className="df-button secondary small"
            disabled={busy}
            onClick={() => setOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="df-button small"
            disabled={busy || !classes}
            onClick={save}
          >
            {busy ? "Saving…" : "Save sharing"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
