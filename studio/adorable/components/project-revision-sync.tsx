"use client";

import { useEffect } from "react";

/** Keep edit requests revision-bound without displaying internal run metadata. */
export function ProjectRevisionSync({
  projectId,
  onRevision,
}: {
  projectId: string | null;
  onRevision: (project: string, revision: number) => void;
}) {
  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    let inFlight = false;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch(
          `/api/projects/${projectId}/execution?summary=1`,
          {
            cache: "no-store",
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(10000),
            ]),
          },
        );
        if (!response.ok) return;
        const next = await response.json();
        if (!controller.signal.aborted) {
          onRevision(projectId, next.revision);
          window.dispatchEvent(
            new CustomEvent("adorable:project-revision", {
              detail: {
                projectId,
                revision: next.revision,
                activeRun: next.activeRun,
              },
            }),
          );
        }
      } catch {
        // A later poll retries; the server still rejects stale edit revisions.
      } finally {
        inFlight = false;
      }
    };
    void load();
    const timer = setInterval(load, 3000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [projectId, onRevision]);

  return null;
}
