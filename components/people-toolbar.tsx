"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { CopyButton } from "./copy-button";
export function PeopleToolbar({
  role,
  classrooms,
  filter,
  onFilter,
}: {
  role: "student" | "teacher";
  classrooms: { id: string; name: string }[];
  filter: string;
  onFilter: (s: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false),
    [mode, setMode] = useState("account"),
    [classId, setClassId] = useState(""),
    [identifier, setIdentifier] = useState(""),
    [person, setPerson] = useState<{
      display_name: string;
      username: string;
    } | null>(null),
    [link, setLink] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function submit(action: string) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/platform/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, role, classId, identifier }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      if (action === "lookup") setPerson(d.person);
      if (action === "invite") setLink(d.link);
      if (action === "add") {
        setOpen(false);
        setNotice(`${d.person.display_name} added to classroom.`);
        router.refresh();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="df-people-toolbar">
        <label>
          Classroom
          <select
            className="df-input"
            value={filter}
            onChange={(e) => onFilter(e.target.value)}
          >
            <option value="">All classrooms</option>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="df-button"
          disabled={!classrooms.length}
          onClick={() => {
            setOpen(true);
            setClassId(filter || classrooms[0]?.id || "");
            setPerson(null);
            setLink("");
            setIdentifier("");
            setError("");
          }}
        >
          Add {role}
        </button>
      </div>
      {notice && <p role="status">{notice}</p>}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!busy) setOpen(v);
        }}
      >
        <DialogContent
          className="df-card df-add-person-dialog"
          style={{ background: "white", color: "#1a0f2e" }}
        >
          <DialogTitle>Add {role}</DialogTitle>
          <DialogDescription>
            Add an existing account to a classroom, or share a signup link.
          </DialogDescription>
          <div className="df-inline" role="group" aria-label="Add method">
            <button
              className="df-button secondary small"
              aria-pressed={mode === "account"}
              onClick={() => {
                setMode("account");
                setError("");
              }}
            >
              Username or email
            </button>
            <button
              className="df-button secondary small"
              aria-pressed={mode === "invite"}
              onClick={() => {
                setMode("invite");
                setError("");
              }}
            >
              Invite link
            </button>
          </div>
          <form
            className="df-form"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(
                mode === "invite" ? "invite" : person ? "add" : "lookup",
              );
            }}
          >
            <label>
              Classroom
              <select
                className="df-input"
                disabled={busy}
                value={classId}
                onChange={(e) => {
                  setClassId(e.target.value);
                  setPerson(null);
                  setLink("");
                }}
                required
              >
                {classrooms.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            {mode === "account" && (
              <label>
                Username or email
                <input
                  className="df-input"
                  placeholder="Find people"
                  value={identifier}
                  onChange={(e) => {
                    setIdentifier(e.target.value);
                    setPerson(null);
                  }}
                  required
                  disabled={busy}
                />
              </label>
            )}
            {mode === "account" && person && (
              <div className="df-notice">
                <strong>{person.display_name}</strong>
                <span> @{person.username}</span>
              </div>
            )}
            {mode === "invite" && link && (
              <div className="df-inline">
                <input
                  className="df-input"
                  aria-label={`${role} invitation link`}
                  readOnly
                  value={link}
                />
                <CopyButton value={link}>Copy link</CopyButton>
              </div>
            )}
            {error && (
              <p role="alert" className="df-error">
                {error}
              </p>
            )}
            <div className="df-inline" style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                className="df-button secondary"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button className="df-button" disabled={busy || !classId}>
                {busy
                  ? "Loading…"
                  : mode === "invite"
                    ? "Create invite link"
                    : person
                      ? "Add to classroom"
                      : "Find account"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
