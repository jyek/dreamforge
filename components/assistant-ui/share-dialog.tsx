"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Share2Icon } from "lucide-react";
import type { ProjectItem } from "@/lib/project-types";
export function ShareDialog({ project }: { project: ProjectItem }) {
  const [share, setShare] = useState<{
      url?: string;
      revision?: number;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setError("");
    setShare(null);
    try {
      const r = await fetch(`/api/projects/${project.id}/share`, {
        cache: "no-store",
      });
      if (!r.ok) throw Error();
      setShare(await r.json());
    } catch {
      setError("Could not load approved sharing.");
    }
  }
  async function approve() {
    setBusy(true);
    setError("");
    try {
      const status = await fetch(`/api/projects/${project.id}/execution`, {
        cache: "no-store",
      });
      if (!status.ok) throw Error("Project status is unavailable.");
      const { revision } = await status.json();
      const r = await fetch(`/api/projects/${project.id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision }),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error);
      setShare(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not approve sharing.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) void load();
      }}
    >
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background">
          <Share2Icon className="size-3" />
          Share
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share a reviewed revision</DialogTitle>
          <DialogDescription>
            Your teacher approves a fixed copy. Later edits stay in your
            workspace.
          </DialogDescription>
        </DialogHeader>
        {share?.url ? (
          <>
            <a
              className="break-all underline"
              href={share.url}
              target="_blank"
              rel="noreferrer"
            >
              Open approved revision {share.revision}
            </a>
            <Button
              onClick={() =>
                void navigator.clipboard
                  .writeText(share.url!)
                  .catch(() => setError("Select the link to copy it."))
              }
            >
              Copy approved link
            </Button>
          </>
        ) : (
          <p>No approved link yet. Ask your teacher to review this project.</p>
        )}
        <Button disabled={busy} onClick={() => void approve()}>
          {busy
            ? "Preparing reviewed copy…"
            : "Teacher: approve current revision"}
        </Button>
        {error && <p role="alert">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
