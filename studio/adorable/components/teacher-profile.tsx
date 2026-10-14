"use client";
import { useState, type FormEvent } from "react";
import { signOut } from "./studio-sidebar";
export function TeacherProfile({
  name,
  onSaved,
}: {
  name: string;
  onSaved: () => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(name),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/platform/auth", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: displayName }),
      });
      const result = await response.json();
      if (!response.ok)
        throw Error(result.error || "Could not save your profile.");
      setDisplayName(result.name);
      await onSaved();
      setMessage("Profile saved.");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="df-card df-teacher-profile">
      <h2>Your profile</h2>
      <p className="df-muted">Update the name shown in your teacher studio.</p>
      <form className="df-form" onSubmit={save}>
        <label>
          Display name
          <input
            className="df-input"
            name="name"
            value={displayName}
            onChange={(event) => {
              setDisplayName(event.target.value);
              setMessage("");
            }}
            required
            maxLength={60}
            disabled={busy}
          />
        </label>
        <div className="df-inline">
          <button className="df-button" disabled={busy}>
            {busy ? "Saving…" : "Save profile"}
          </button>
          <button
            className="df-button secondary"
            type="button"
            disabled={busy}
            onClick={signOut}
          >
            Log out
          </button>
        </div>
        {message && (
          <p className="df-muted" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="df-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
