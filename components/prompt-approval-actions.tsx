"use client";
import { useState } from "react";
export function PromptApprovalActions({
  reviewId,
  classrooms,
  onDecided,
}: {
  reviewId: string;
  classrooms: { id: string; name: string }[];
  onDecided: () => void;
}) {
  const [chosen, setChosen] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const classId = classrooms.length === 1 ? classrooms[0].id : chosen;
  if (!classrooms.length) return null;
  async function decide(action: "approve" | "deny") {
    if (busy || !classrooms.some((c) => c.id === classId)) return;
    setBusy(action);
    setError("");
    try {
      const r = await fetch("/api/platform/reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: reviewId, classId, action }),
        }),
        d = await r.json();
      if (!r.ok || !d.ok)
        throw Error(
          d.error ||
            "This request was already handled or your classroom access changed. Refresh to check.",
        );
      onDecided();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="df-prompt-approval-actions">
      {classrooms.length > 1 && (
        <label>
          Approve as classroom teacher
          <select
            aria-label="Approval classroom"
            className="df-input"
            value={chosen}
            disabled={!!busy}
            onChange={(e) => setChosen(e.target.value)}
          >
            <option value="">Choose a classroom</option>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="df-inline">
        <button
          type="button"
          className="df-button small"
          disabled={!!busy || !classId}
          onClick={() => void decide("approve")}
        >
          {busy === "approve" ? "Approving…" : "Approve"}
        </button>
        <button
          type="button"
          className="df-button secondary small"
          disabled={!!busy || !classId}
          onClick={() => void decide("deny")}
        >
          {busy === "deny" ? "Declining…" : "Don’t approve"}
        </button>
      </div>
      {error && (
        <p className="df-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
