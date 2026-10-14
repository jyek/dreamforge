"use client";
import { InlineSpinner } from "./dream-loading";
import { useRef, useState, type FormEvent } from "react";
import { Plus, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";

export function CreateProjectDialog({
  initialPrompt = "",
  trigger,
}: {
  initialPrompt?: string;
  trigger?: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const projectName = name.trim();
    if (!projectName || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: projectName }),
      });
      const result = await response.json();
      if (!response.ok)
        throw Error(
          result.error || "We couldn’t create your project. Try again.",
        );
      if (initialPrompt.trim())
        sessionStorage.setItem(
          `dreamforge:initial-prompt:${result.id}:${result.conversationId}`,
          initialPrompt.trim(),
        );
      window.location.assign(`/${result.id}/${result.conversationId}`);
    } catch (e) {
      setError((e as Error).message);
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submitting.current) return;
        setOpen(next);
        if (next) {
          setName("");
          setError("");
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger || (
          <button
            className="df-button"
            aria-label="Create a project"
            title="Create a project"
          >
            <Plus size={16} aria-hidden="true" />
            <span>Create a project</span>
          </button>
        )}
      </DialogTrigger>
      <DialogContent
        className="df-card df-project-dialog"
        showCloseButton={!busy}
        onEscapeKeyDown={(e) => {
          if (busy) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <span className="df-project-icon" aria-hidden="true">
          <Sparkles size={24} />
        </span>
        <DialogTitle className="df-dialog-title">
          Every big idea needs a name.
        </DialogTitle>
        <DialogDescription className="df-muted">
          What will you call your project? You can change it later.
        </DialogDescription>
        <form className="df-form" onSubmit={create}>
          <label htmlFor="new-project-name">Project name</label>
          <input
            id="new-project-name"
            className="df-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Space Explorer"
            maxLength={80}
            required
            disabled={busy}
            autoComplete="off"
            autoFocus
          />
          {error && (
            <p className="df-error" role="alert">
              {error}
            </p>
          )}
          {busy && (
            <p className="df-muted" role="status">
              Getting your creative workspace ready…
            </p>
          )}
          <div className="df-inline">
            <button className="df-button" disabled={busy || !name.trim()}>
              {busy && <InlineSpinner className="size-4" />}
              {busy ? "Creating your project…" : "Let’s build →"}
            </button>
            <button
              type="button"
              className="df-button secondary"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
