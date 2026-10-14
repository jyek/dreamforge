"use client";
import { useState, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
export function PlatformClassCard({
  classroom,
  teacher,
  onChanged,
}: {
  classroom: { id: string; name: string; invite_code?: string };
  teacher: boolean;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false),
    [name, setName] = useState(classroom.name),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function change(method: "PATCH" | "DELETE") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/platform/classes", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: classroom.id, name }),
      });
      const data = await response.json();
      if (!response.ok)
        throw Error(data.error || "Could not update this class.");
      setEditing(false);
      setConfirm(false);
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function rename(e: FormEvent) {
    e.preventDefault();
    void change("PATCH");
  }
  return (
    <section className="df-card">
      {editing ? (
        <form className="df-form" onSubmit={rename}>
          <label>
            Class name
            <input
              className="df-input"
              aria-label={`New name for ${classroom.name}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={80}
              autoFocus
            />
          </label>
          <div className="df-inline">
            <button className="df-button small" disabled={busy}>
              {busy ? "Saving…" : "Save name"}
            </button>
            <button
              type="button"
              className="df-button secondary small"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setError("");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <strong>{classroom.name}</strong>
      )}
      {classroom.invite_code && (
        <>
          <p className="df-muted" style={{ fontSize: 12 }}>
            Class invitation code
          </p>
          <button
            className="df-button secondary small"
            onClick={() =>
              navigator.clipboard.writeText(classroom.invite_code!)
            }
          >
            {classroom.invite_code} ⧉
          </button>
        </>
      )}
      {teacher && !editing && (
        <div className="df-inline" style={{ marginTop: 18 }}>
          <button
            className="df-button secondary small"
            aria-label={`Rename ${classroom.name}`}
            onClick={() => {
              setName(classroom.name);
              setEditing(true);
              setError("");
            }}
          >
            Rename
          </button>
          <button
            className="df-button secondary small"
            aria-label={`Delete ${classroom.name}`}
            onClick={() => {
              setConfirm(true);
              setError("");
            }}
          >
            Delete
          </button>
        </div>
      )}
      {error && !confirm && (
        <p role="alert" className="df-error" style={{ marginTop: 15 }}>
          {error}
        </p>
      )}
      <Dialog
        open={confirm}
        onOpenChange={(open) => {
          if (!busy) setConfirm(open);
        }}
      >
        <DialogContent
          className="df-card"
          style={{ background: "#FFF6E6", color: "#1A0F2E" }}
        >
          <DialogTitle>Delete {classroom.name}?</DialogTitle>
          <DialogDescription>
            This removes the class and its invitation code. Builders stay in
            your roster, and their accounts, projects, tokens and prompt history
            are kept.
          </DialogDescription>
          {error && (
            <p role="alert" className="df-error">
              {error}
            </p>
          )}
          <div className="df-inline">
            <button
              className="df-button secondary"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              Keep class
            </button>
            <button
              className="df-button"
              style={{ background: "#D74242" }}
              disabled={busy}
              onClick={() => change("DELETE")}
            >
              {busy ? "Deleting…" : "Delete class"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
