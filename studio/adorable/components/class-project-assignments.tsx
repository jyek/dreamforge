"use client";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "./ui/dialog";
import { InlineSpinner } from "./dream-loading";
import { TableEmptyState } from "./table-empty-state";
export type AssignableProject = {
  vm_id: string;
  name: string;
  assigned: boolean;
};
export function ClassProjectAssignments({
  classId,
  projects,
  onChanged,
}: {
  classId: string;
  projects: AssignableProject[];
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  async function assign(projectId: string, checked: boolean) {
    setBusy(projectId);
    setError("");
    try {
      const r = await fetch(`/api/platform/classes/${classId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          action: checked ? "assign" : "remove",
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || "Could not update assignment.");
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <button className="df-button">Assign projects</button>
      </DialogTrigger>
      <DialogContent
        className="df-card"
        style={{ background: "#fff", color: "#1a0f2e" }}
      >
        <DialogTitle>Assign your projects</DialogTitle>
        <DialogDescription>
          Choose which of your projects this classroom can see. Your work stays
          yours.
        </DialogDescription>
        {error && (
          <p role="alert" className="df-error">
            {error}
          </p>
        )}
        <div className="df-assignment-list">
          {projects.length ? (
            projects.map((p) => (
              <label key={p.vm_id} className="df-assignment-option">
                <input
                  type="checkbox"
                  checked={p.assigned}
                  disabled={!!busy}
                  onChange={(e) => void assign(p.vm_id, e.target.checked)}
                />
                <span>{p.name}</span>
                {busy === p.vm_id && <InlineSpinner />}
              </label>
            ))
          ) : (
            <TableEmptyState
              title="Your ideas belong here"
              description="After you build a project, you can choose to share it with this classroom."
            />
          )}
        </div>
        <div
          className="df-inline"
          style={{ justifyContent: "flex-end", marginTop: 18 }}
        >
          <button
            className="df-button"
            disabled={!!busy}
            onClick={() => setOpen(false)}
          >
            Done
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
