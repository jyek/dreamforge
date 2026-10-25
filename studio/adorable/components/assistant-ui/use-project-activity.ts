"use client";
import { PROJECT_IDLE_SECONDS } from "@/lib/project-idle.mjs";
import { useCallback, useEffect, useRef, useState } from "react";

type Status = "starting" | "ready" | "idle" | "error";
type RuntimeResponse = { ready?: boolean; state?: string; error?: string };

export function useProjectActivity(
  projectId: string,
  previewUrl: string,
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  running: boolean,
) {
  const [status, setStatus] = useState<Status>("starting");
  const [error, setError] = useState("");
  const [generation, setGeneration] = useState(0);
  const runningRef = useRef(running);
  runningRef.current = running;
  const resumeRef = useRef<() => Promise<void>>(async () => {});
  const resume = useCallback(() => resumeRef.current(), []);

  useEffect(() => {
    const controller = new AbortController();
    let lastActivity = Date.now(),
      lastSent = 0,
      inFlight = false;
    let currentStatus: Status = "starting";
    const changeStatus = (next: Status) => {
      currentStatus = next;
      if (!controller.signal.aborted) setStatus(next);
    };
    const request = async () => {
      const response = await fetch(`/api/projects/${projectId}/runtime`, {
        method: "POST",
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(15000),
        ]),
      });
      const data: RuntimeResponse = await response.json();
      if (
        data.state === "blocked" ||
        [400, 401, 403, 404].includes(response.status)
      )
        return {
          ready: false,
          blocked: data.error || "This project could not start.",
        };
      if (!response.ok)
        throw new Error(data.error || "The VM could not start.");
      lastSent = Date.now();
      return { ready: data.ready === true, blocked: "" };
    };
    const wake = async () => {
      if (inFlight || controller.signal.aborted) return;
      inFlight = true;
      lastActivity = Date.now();
      setError("");
      changeStatus("starting");
      const deadline = Date.now() + 90000;
      let retryDelay = 250;
      try {
        while (!controller.signal.aborted && Date.now() < deadline) {
          try {
            const result = await request();
            if (controller.signal.aborted) return;
            if (result.blocked) {
              setError(result.blocked);
              changeStatus("error");
              return;
            }
            if (result.ready) {
              setGeneration((value) => value + 1);
              changeStatus("ready");
              return;
            }
          } catch {
            if (controller.signal.aborted) return;
          }
          await new Promise<void>((resolve) => {
            const done = () => {
              clearTimeout(timer);
              controller.signal.removeEventListener("abort", done);
              resolve();
            };
            const timer = setTimeout(done, retryDelay);
            controller.signal.addEventListener("abort", done, { once: true });
          });
          retryDelay = Math.min(1500, retryDelay * 2);
        }
        if (!controller.signal.aborted) {
          setError(
            "The VM is taking longer than expected to start. Please try again.",
          );
          changeStatus("error");
        }
      } finally {
        inFlight = false;
      }
    };
    resumeRef.current = wake;
    void wake();
    const activity = () => {
      lastActivity = Date.now();
    };
    const message = (event: MessageEvent) => {
      if (
        event.source === iframeRef.current?.contentWindow &&
        (event.origin === new URL(previewUrl).origin ||
          (previewUrl.includes("/preview/") && event.origin === "null")) &&
        event.data?.type === "adorable:preview-activity"
      )
        activity();
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"];
    events.forEach((event) =>
      window.addEventListener(event, activity, { passive: true }),
    );
    window.addEventListener("message", message);
    const timer = setInterval(() => {
      if (runningRef.current) lastActivity = Date.now();
      if (inFlight || currentStatus === "error") return;
      if (Date.now() - lastActivity >= PROJECT_IDLE_SECONDS * 1000) {
        changeStatus("idle");
        return;
      }
      if (currentStatus === "idle") return;
      if (lastActivity > lastSent && Date.now() - lastSent > 45000) {
        inFlight = true;
        void request()
          .then((result) => {
            if (controller.signal.aborted) return;
            if (result.blocked) {
              setError(result.blocked);
              changeStatus("error");
            } else if (!result.ready) changeStatus("starting");
          })
          .catch(() => {
            if (!controller.signal.aborted) changeStatus("starting");
          })
          .finally(() => {
            inFlight = false;
            if (currentStatus === "starting") void wake();
          });
      }
    }, 5000);
    return () => {
      controller.abort();
      clearInterval(timer);
      events.forEach((event) => window.removeEventListener(event, activity));
      window.removeEventListener("message", message);
    };
  }, [projectId, previewUrl, iframeRef]);

  const [revisionState, setRevisionState] = useState<{
    projectId: string;
    revision: number;
    activeRun: string | null;
  } | null>(null);
  const renderedRevision = useRef<{
    projectId: string;
    revision: number;
  } | null>(null);
  useEffect(() => {
    const changed = (event: Event) => {
      const next = (event as CustomEvent<NonNullable<typeof revisionState>>)
        .detail;
      if (next?.projectId === projectId && Number.isSafeInteger(next.revision))
        setRevisionState(next);
    };
    window.addEventListener("adorable:project-revision", changed);
    return () =>
      window.removeEventListener("adorable:project-revision", changed);
  }, [projectId]);
  useEffect(() => {
    if (!revisionState || revisionState.projectId !== projectId) return;
    if (renderedRevision.current?.projectId !== projectId) {
      renderedRevision.current = {
        projectId,
        revision: revisionState.revision,
      };
      return;
    }
    if (
      !running &&
      !revisionState.activeRun &&
      renderedRevision.current.revision !== revisionState.revision
    ) {
      renderedRevision.current = {
        projectId,
        revision: revisionState.revision,
      };
      if (previewUrl.includes("/preview/") && iframeRef.current)
        iframeRef.current.src = previewUrl;
    }
  }, [revisionState, running, projectId, previewUrl, iframeRef]);
  return {
    idle: status === "idle",
    starting: status === "starting",
    ready: status === "ready",
    error,
    generation,
    resume,
  };
}
