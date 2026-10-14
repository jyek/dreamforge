"use client";
import { useRef, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { DreamLoader } from "./dream-loading";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "./ui/dialog";
export function CreateClassDialog({
  onCreated,
}: {
  onCreated: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submitting = useRef(false);
  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/platform/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || "Could not create class.");
      await onCreated();
      setOpen(false);
      setName("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) {
          setOpen(next);
          setError("");
          if (next) setName("");
        }
      }}
    >
      <DialogTrigger asChild>
        <button className="df-button">
          <Plus size={17} aria-hidden="true" />
          Create class
        </button>
      </DialogTrigger>
      <DialogContent
        className="df-card"
        style={{ background: "#fff", color: "#1a0f2e" }}
      >
        <DialogTitle>Create a class</DialogTitle>
        <DialogDescription>
          Give your classroom a name. You’ll get a Class Number to share with
          students.
        </DialogDescription>
        <form className="df-form" onSubmit={create}>
          <label>
            Class name
            <input
              className="df-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Creative Coding"
              required
              maxLength={80}
              disabled={busy}
              autoFocus
            />
          </label>
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
            <button className="df-button" disabled={busy || !name.trim()}>
              {busy && <DreamLoader className="size-4" />}
              {busy ? "Creating…" : "Create class"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
