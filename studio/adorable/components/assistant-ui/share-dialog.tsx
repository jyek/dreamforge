"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  Share2Icon,
} from "lucide-react";
import type { ProjectItem } from "@/lib/project-types";

export function ShareDialog({ project }: { project: ProjectItem }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [shareUrl, setShareUrl] = useState(project.previewUrl);

  const copyLink = async () => {
    setCopyError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/share`, {
        cache: "no-store",
      });
      if (!response.ok) throw Error("Could not create share link");
      const { url } = await response.json();
      setShareUrl(url);
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopyError("Select the link to copy it manually.");
    }
  };

  return (
    <Dialog
      onOpenChange={() => {
        setCopied(false);
        setCopyError("");
        setShareUrl(project.previewUrl);
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-colors hover:bg-foreground/90"
        >
          <Share2Icon className="size-3" />
          Share
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share site</DialogTitle>
          <DialogDescription>
            Anyone with this link can open your current preview.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              aria-label="Share link"
              value={shareUrl}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
            />
            <Button onClick={copyLink} className="shrink-0">
              {copied ? (
                <CheckIcon className="size-4" />
              ) : (
                <CopyIcon className="size-4" />
              )}
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
          {copyError && (
            <p role="alert" className="text-xs text-destructive">
              {copyError}
            </p>
          )}
          <div className="flex items-start justify-between gap-4 text-xs text-muted-foreground">
            <p>
              This link shows your latest changes and wakes a resting workspace.
              Runtime trial links expire after seven days; copy a fresh link
              here.
            </p>
            <a
              href={shareUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1 hover:underline"
            >
              Open site <ExternalLinkIcon className="size-3" />
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
