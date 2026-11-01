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
import { SimpleLoading } from "./dream-loading";
export function ProjectClassroomSharing({
  projectId,
  name,
  student = false,
}: {
  projectId: string;
  name: string;
  student?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [classes, setClasses] = useState<
      { id: string; name: string; attached: boolean }[] | null
    >(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setError("");
    setClasses(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/classrooms`),
        d = await r.json();
      if (!r.ok) throw Error(d.error);
      setClasses(d.classes);
    } catch (e) {
      setError((e as Error).message);
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
        setOpen(value);
        if (value) void load();
      }}
    >
      <DialogTrigger asChild>
        <button className="df-button secondary small">
          {student ? "Assign to classrooms" : "Share with classrooms"}
        </button>
      </DialogTrigger>
      <DialogContent className="df-card">
        <DialogTitle>Share {name}</DialogTitle>
        <DialogDescription>
          {student
            ? "Choose the classrooms for this project. You can assign it to more than one classroom."
            : "Choose the classrooms that can view this project. Students can explore it, but cannot edit your copy."}
        </DialogDescription>
        {!classes && !error && (
          <SimpleLoading inline label="Loading classrooms…" />
        )}
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
