"use client";
import { useEffect, useState } from "react";
import { StudentReviewTable } from "./student-review-table";
type Invite = {
  id: string;
  expires_at: string;
  classroom_name: string | null;
  make_admin?: boolean;
};
export function ActiveInvitations({
  role,
  refreshKey,
}: {
  role: "teacher" | "student";
  refreshKey: number;
}) {
  const [rows, setRows] = useState<Invite[] | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setRows(null);
    setError("");
    fetch(`/api/platform/invitations?role=${role}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error || "Could not load invitations.");
        setRows(d.invitations);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [role, refreshKey]);
  async function revoke(id: string) {
    setBusy(id);
    setError("");
    try {
      const r = await fetch("/api/platform/invitations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, role }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setRows((current) => current?.filter((i) => i.id !== id) || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="df-active-invitations">
      <h3>Active invite links</h3>
      {error && <p role="alert">{error}</p>}
      <StudentReviewTable
        columns={3}
        busy={!rows && !error}
        loadingLabel="Loading…"
        compact={false}
      >
        <thead>
          <tr>
            <th>Access</th>
            <th>Expires</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows?.map((i) => (
            <tr key={i.id}>
              <td>
                {i.make_admin
                  ? "School Admin"
                  : i.classroom_name || "School only"}
                <small className="df-person-username">
                  Invite {i.id.slice(0, 8)}
                </small>
              </td>
              <td>{new Date(i.expires_at).toLocaleDateString()}</td>
              <td>
                <button
                  type="button"
                  className="df-button secondary small"
                  disabled={!!busy}
                  onClick={() => void revoke(i.id)}
                  aria-label={`Revoke invitation ${i.id.slice(0, 8)}`}
                >
                  {busy === i.id ? "Revoking…" : "Revoke"}
                </button>
              </td>
            </tr>
          ))}
          {rows && !rows.length && (
            <tr>
              <td colSpan={3}>No active invite links.</td>
            </tr>
          )}
        </tbody>
      </StudentReviewTable>
    </section>
  );
}
