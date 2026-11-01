"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CircleCheck,
  ShieldCheck,
  LoaderCircle,
  CircleAlert,
} from "lucide-react";
type Entry = { id: string; name: string; waiting: number; unreviewed: number };
export function TeacherActionSummary() {
  const [rows, setRows] = useState<Entry[] | null>(null),
    [error, setError] = useState(false);
  useEffect(() => {
    let stopped = false;
    async function load() {
      try {
        const r = await fetch("/api/platform/action-summary", {
          cache: "no-store",
        });
        if (!r.ok) throw Error();
        const d = await r.json();
        if (!stopped) {
          setRows(d.classes);
          setError(false);
        }
      } catch {
        if (!stopped) setError(true);
      }
    }
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 10000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);
  const pending = rows?.filter((c) => c.waiting > 0 || c.unreviewed > 0) || [];
  return (
    <section
      className="df-teacher-actions"
      aria-labelledby="teacher-actions-title"
    >
      <div className="df-section-head">
        <h2 id="teacher-actions-title">Safety and actions needed</h2>
      </div>
      <div className="df-action-list" aria-busy={!rows && !error}>
        {error ? (
          <p className="df-action-row df-action-status" role="status">
            <CircleAlert size={20} aria-hidden="true" />
            <span>
              Could not refresh actions.{" "}
              <Link href="/safety">Open Safety to check the action list.</Link>
            </span>
          </p>
        ) : !rows ? (
          <p className="df-action-row df-action-status" role="status">
            <LoaderCircle size={20} aria-hidden="true" />
            <span>Loading classroom actions…</span>
          </p>
        ) : pending.length === 0 ? (
          <p className="df-action-row df-action-status" role="status">
            <CircleCheck size={20} aria-hidden="true" />
            <span>
              <strong>Nothing to review.</strong> No pending approvals or safety
              items.
            </span>
          </p>
        ) : (
          pending.flatMap((c) =>
            [
              ...(c.waiting > 0
                ? [
                    {
                      key: `${c.id}-approve`,
                      label: `Approve ${c.waiting} ${c.waiting === 1 ? "prompt" : "prompts"}`,
                    },
                  ]
                : []),
              ...(c.unreviewed > 0
                ? [
                    {
                      key: `${c.id}-review`,
                      label: `Review ${c.unreviewed} safety ${c.unreviewed === 1 ? "flag" : "flags"}`,
                    },
                  ]
                : []),
            ].map((action) => (
              <Link
                key={action.key}
                href={`/safety?classId=${c.id}`}
                className="df-action-row df-action-link"
              >
                <ShieldCheck size={20} aria-hidden="true" />
                <strong className="df-action-class">{action.label}</strong>
                <span className="df-action-counts">{c.name}</span>
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            )),
          )
        )}
      </div>
    </section>
  );
}
