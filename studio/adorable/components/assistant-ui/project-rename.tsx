"use client";

import { useState, type ReactNode } from "react";
import { PencilIcon, Loader2Icon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ProjectRename({
  projectId,
  name,
  onRenamed,
  children,
  className,
}: {
  projectId: string;
  name: string;
  onRenamed: (id: string, name: string) => void;
  children?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(name);
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
        body: JSON.stringify({ name: next }),
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
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename project</DialogTitle>
          <DialogDescription>
            Choose a name that makes your project easy to find.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void save(event)} className="space-y-4">
          <label className="block space-y-2 text-sm font-medium">
            Project name
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={80}
              required
              autoFocus
              disabled={saving}
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !draft.trim()}>
              {saving && <Loader2Icon className="size-4 animate-spin" />}Save
              name
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
