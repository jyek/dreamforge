"use client";
import { useCallback, useEffect, useState } from "react";
import { guidanceCategories } from "@/lib/prompt-guidance";
type Review = {
  id: string;
  child_name: string;
  project_name: string;
  content: string;
  decision: "allow" | "block" | "review";
  categories: string[];
  hold_status: "pending" | "approved" | "denied" | null;
  reviewed_at: string | null;
  created_at: string;
};
const label = (r: Review) =>
  r.hold_status === "pending"
    ? "Needs your approval"
    : r.hold_status === "approved"
      ? "Approved"
      : r.hold_status === "denied"
        ? "Not approved"
        : r.decision === "block"
          ? "Blocked"
          : "Flagged";
/** Blocked and questionable prompts for one classroom, newest first, with the
 * prompts waiting for approval pinned to the top. */
export function ClassroomSafetyReport({ classId }: { classId: string }) {
  const [reviews, setReviews] = useState<Review[] | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [showAll, setShowAll] = useState(false);
  const load = useCallback(async () => {
    const r = await fetch(`/api/platform/reviews?classId=${classId}&flags=1`, {
      cache: "no-store",
    });
    const d = await r.json();
    if (!r.ok) throw Error(d.error || "Could not load the safety report.");
    setReviews(d.reviews);
  }, [classId]);
  useEffect(() => {
    let stopped = false;
    const run = () =>
      load().catch((e) => !stopped && setError((e as Error).message));
    void run();
    // Students are waiting on approvals, so keep this fresh while it is open.
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void run();
    }, 10000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [load]);
  async function decide(id: string, action: "approve" | "deny") {
    setBusy(id);
    setError("");
    try {
      const r = await fetch("/api/platform/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw Error("That request has already been handled.");
      await load();
    } catch (e) {
      setError((e as Error).message);
      await load().catch(() => {});
    } finally {
      setBusy("");
    }
  }
  const pending = reviews?.filter((r) => r.hold_status === "pending") || [];
  const rest = reviews?.filter((r) => r.hold_status !== "pending") || [];
  const shown = showAll ? rest : rest.slice(0, 8);
  return (
    <section className="df-safety-report" aria-labelledby="safety-report-title">
      <div className="df-section-head">
        <h3 id="safety-report-title">Safety report</h3>
        {reviews && (
          <span>
            {pending.length} waiting for you · {rest.length} blocked or flagged
          </span>
        )}
      </div>
      {!reviews && !error && <p>Loading safety report…</p>}
      {reviews && !reviews.length && (
        <p>No blocked or questionable prompts in this class.</p>
      )}
      {[...pending, ...shown].map((r) => (
        <article
          key={r.id}
          className={
            r.hold_status === "pending"
              ? "df-safety-item df-safety-pending"
              : "df-safety-item"
          }
        >
          <header>
            <strong>{r.child_name}</strong>
            <span className="df-pill">{label(r)}</span>
            <small>
              {new Date(r.created_at).toLocaleString()} · {r.project_name}
            </small>
          </header>
          <p className="df-safety-prompt">“{r.content}”</p>
          {!!r.categories.length && (
            <small>
              {r.categories
                .map((c) => guidanceCategories[c]?.label || c)
                .join(", ")}
            </small>
          )}
          {r.hold_status === "pending" && (
            <div className="df-inline">
              <button
                className="df-button small"
                disabled={!!busy}
                onClick={() => decide(r.id, "approve")}
              >
                Approve
              </button>
              <button
                className="df-button secondary small"
                disabled={!!busy}
                onClick={() => decide(r.id, "deny")}
              >
                Don’t approve
              </button>
              <small>
                The student is waiting. Approving lets their request run.
              </small>
            </div>
          )}
        </article>
      ))}
      {rest.length > 8 && (
        <button
          className="df-button secondary small"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? "Show fewer" : `Show all ${rest.length}`}
        </button>
      )}
      {error && (
        <p className="df-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
