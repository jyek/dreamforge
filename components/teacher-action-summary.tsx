"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
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
  return (
    <section className="df-page" aria-labelledby="teacher-actions-title">
      <h2 id="teacher-actions-title">Safety and actions needed</h2>
      {error ? (
        <p role="status">
          Could not refresh classroom actions. Open a classroom to check its
          queue.
        </p>
      ) : !rows ? (
        <p>Loading classroom actions…</p>
      ) : rows.length === 0 ? (
        <p>Your classroom action summaries will appear here.</p>
      ) : (
        rows.map((c) => (
          <Link
            key={c.id}
            href={`/classrooms/${c.id}`}
            className="df-school-row"
          >
            <strong>{c.name}</strong>
            <span>
              {c.waiting} awaiting approval · {c.unreviewed} safety items to
              review →
            </span>
          </Link>
        ))
      )}
    </section>
  );
}
