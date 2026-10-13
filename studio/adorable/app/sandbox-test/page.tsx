"use client";
import { useEffect, useRef, useState } from "react";
type Workspace = {
  name: string;
  state: string;
  previewUrl: string;
  idleSeconds: number;
  vcpus: number;
  memoryMiB: number;
};

export default function SandboxTestPage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [generation, setGeneration] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    void fetch("/api/sandbox-test")
      .then((r) => r.json())
      .then((data) => setWorkspace(data.workspace || null));
  }, []);
  const act = async (action: string) => {
    setBusy(action);
    setError("");
    try {
      const response = await fetch("/api/sandbox-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setWorkspace(data.workspace);
      setGeneration((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Test action failed");
    } finally {
      setBusy("");
    }
  };
  const running = workspace?.state === "running";
  useEffect(() => {
    if (!workspace?.name || !running) return;
    let lastActivity = Date.now();
    let cancelled = false;
    const activity = () => {
      lastActivity = Date.now();
    };
    const message = (event: MessageEvent) => {
      if (
        event.source === iframeRef.current?.contentWindow &&
        event.origin === new URL(workspace.previewUrl).origin &&
        event.data?.type === "adorable:preview-activity"
      )
        activity();
    };
    window.addEventListener("pointerdown", activity);
    window.addEventListener("keydown", activity);
    window.addEventListener("message", message);
    const timer = setInterval(() => {
      const active = Date.now() - lastActivity < workspace.idleSeconds * 1000;
      void fetch(
        "/api/sandbox-test",
        active
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "touch" }),
            }
          : {},
      )
        .then((r) => r.json())
        .then((data) => {
          if (!cancelled && data.workspace) setWorkspace(data.workspace);
        })
        .catch(() => {});
    }, 45000);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
      window.removeEventListener("message", message);
    };
  }, [workspace?.name, running]);
  return (
    <main className="flex min-h-screen flex-col bg-slate-50 p-5 text-slate-800">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-widest text-slate-400 uppercase">
            DreamForge · isolated pilot
          </p>
          <h1 className="mt-1 text-xl font-semibold">Vercel Sandbox test</h1>
          <p className="mt-1 text-sm text-slate-500">
            2 vCPU · 4 GiB · five-minute idle timeout · persistent files
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(!workspace
            ? [["create", "Start test workspace"]]
            : [
                [
                  running ? "pause" : "resume",
                  running ? "Stop and save" : "Resume workspace",
                ],
                ["edit", "Test live file edit"],
                ["delete", "Remove test workspace"],
              ]
          ).map(([action, label]) => (
            <button
              key={action}
              disabled={!!busy}
              onClick={() => void act(action)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm disabled:opacity-40"
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      <p className="mb-4 text-xs text-slate-500">
        Production DreamForge is unchanged. Estimated compute at 10% CPU use:
        $0.11/hour before credits and snapshot storage.
      </p>
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      <section className="relative flex min-h-[65vh] flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {busy ? (
          <div
            role="status"
            className="grid flex-1 place-items-center text-sm text-slate-500"
          >
            {busy === "edit"
              ? "Updating preview source…"
              : busy === "pause"
                ? "Saving workspace files…"
                : busy === "delete"
                  ? "Removing test workspace…"
                  : "Starting up your test workspace…"}
          </div>
        ) : running ? (
          <iframe
            ref={iframeRef}
            key={generation}
            title="Vercel test preview"
            sandbox="allow-scripts allow-same-origin"
            className="min-h-[65vh] w-full flex-1"
            src={workspace!.previewUrl}
          />
        ) : (
          <div className="grid flex-1 place-items-center px-6 text-center text-sm text-slate-500">
            {workspace
              ? "Workspace stopped. Its files are saved; resume to restore the preview."
              : "Start a test workspace to verify previews, file edits, and stop/resume."}
          </div>
        )}
      </section>
      {workspace && (
        <footer className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-slate-500">
          <span>
            State: {workspace.state} · Idle timeout:{" "}
            {workspace.idleSeconds / 60} minutes
          </span>
          <a
            href={workspace.previewUrl}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Open preview
          </a>
        </footer>
      )}
    </main>
  );
}
