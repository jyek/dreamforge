"use client";
import { useState } from "react";
import { CopyButton } from "./copy-button";
type School = {
  id: string;
  name: string;
  admins: number;
  teachers: number;
  students: number;
};
/** Platform administrators add schools and invite each school's first administrator. */
export function AdminSchools({ initialSchools }: { initialSchools: School[] }) {
  const [schools, setSchools] = useState(initialSchools),
    [name, setName] = useState(""),
    [link, setLink] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/admin/schools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setSchools(d.schools);
      setLink(d.adminInviteLink);
      setName("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="df-page" aria-labelledby="admin-schools-title">
      <h2 id="admin-schools-title">Schools</h2>
      <form className="df-inline" onSubmit={add}>
        <input
          className="df-input"
          placeholder="School name"
          aria-label="School name"
          maxLength={120}
          value={name}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="df-button" disabled={busy || !name.trim()}>
          {busy ? "Adding…" : "Add school"}
        </button>
      </form>
      {link && (
        <div className="df-notice">
          <p>
            Send this link to the school's first administrator. It works once
            and expires in seven days.
          </p>
          <div className="df-inline">
            <input
              className="df-input"
              readOnly
              aria-label="School administrator invitation link"
              value={link}
            />
            <CopyButton value={link} className="df-button secondary small">
              Copy link
            </CopyButton>
          </div>
        </div>
      )}
      {error && (
        <p className="df-error" role="alert">
          {error}
        </p>
      )}
      <div className="df-school-list">
        {!schools.length && <p>No schools yet.</p>}
        {schools.map((s) => (
          <div className="df-school-row" key={s.id}>
            <strong>{s.name}</strong>
            <small>
              {s.admins} administrators · {s.teachers} teachers · {s.students}{" "}
              students
            </small>
          </div>
        ))}
      </div>
    </section>
  );
}
