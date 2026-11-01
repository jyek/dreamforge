"use client";
import { InlineSpinner } from "@/components/dream-loading";

import { useState, type ReactNode } from "react";
import { PencilIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ProjectRename({
  projectId,
  name,
  onRenamed,
  children,
  className,
  description = "",
  editDescription = false,
}: {
  projectId: string;
  name: string;
  onRenamed: (id: string, name: string) => void;
  children?: ReactNode;
  className?: string;
  description?: string;
  editDescription?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(name);
  const [draftDescription, setDraftDescription] = useState(description);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const next = draft.trim();
    if (!next || next.length > 80) {
      setError("Enter a project name between 1 and 80 characters.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: next,
          ...(editDescription ? { description: draftDescription.trim() } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw Error(
          data.error || "Could not rename the project. Please try again.",
        );
      onRenamed(projectId, data.name);
      setOpen(false);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not rename the project.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (saving) return;
        if (next) {
          setDraft(name);
          setDraftDescription(description);
          setError("");
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Rename project"
          title="Rename project"
          className={className}
        >
          {children || (
            <>
              <PencilIcon className="size-4" />
              Rename project
            </>
          )}
        </button>
      </DialogTrigger>
      <DialogContent className="df-card">
        <DialogHeader>
          <DialogTitle>Rename project</DialogTitle>
          <DialogDescription>
            {editDescription
              ? "Set a name and description for your project."
              : "Choose a name that makes your project easy to find."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void save(event)} className="df-form">
          <label className="df-project-details-field">
            Project name
            <input
              className="df-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={80}
              required
              autoFocus
              disabled={saving}
            />
          </label>
          {editDescription && (
            <label className="df-project-details-field">
              Description (optional)
              <textarea
                className="df-input"
                value={draftDescription}
                onChange={(e) => setDraftDescription(e.target.value)}
                maxLength={500}
                rows={3}
                disabled={saving}
                placeholder="What is this project about?"
              />
            </label>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="df-inline" style={{ justifyContent: "flex-end" }}>
            <button
              type="button"
              className="df-button secondary small"
              disabled={saving}
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="df-button small"
              disabled={saving || !draft.trim()}
            >
              {saving && <InlineSpinner className="size-4" />}
              {editDescription ? "Save changes" : "Save name"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
