"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "./ui/dialog";
type Person = { id: string; display_name: string };
export function SchoolSetup({
  teachers,
  classroom,
}: {
  teachers: Person[];
  classroom?: { id: string; name: string; teachers?: Person[] };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const available = teachers.filter(
    (p) => !classroom?.teachers?.some((t) => t.id === p.id),
  );
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const body = Object.fromEntries(new FormData(event.currentTarget));
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/platform/school", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          action: classroom ? "addTeacher" : "createClass",
          ...(classroom ? { classId: classroom.id } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Could not save classroom.");
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save classroom.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) {
          setOpen(next);
          setError("");
        }
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className={classroom ? "df-button secondary small" : "df-button"}
          aria-label={
            classroom ? `Add teacher to ${classroom.name}` : undefined
          }
          disabled={!available.length}
        >
          {classroom ? "Add teacher" : "New classroom"}
        </button>
      </DialogTrigger>
      <DialogContent
        className="df-card"
        style={{ background: "#fff", color: "#1a0f2e" }}
      >
        <DialogTitle>
          {classroom ? "Add a co-teacher" : "Create a classroom"}
        </DialogTitle>
        <DialogDescription>
          {classroom
            ? `Choose a teacher to join ${classroom.name}.`
            : "Give your classroom a name and choose its lead teacher."}
        </DialogDescription>
        <form onSubmit={submit} className="df-form df-school-classroom-form">
          {!classroom && (
            <label>
              Classroom name
              <input
                className="df-input"
                name="name"
                required
                maxLength={80}
                pattern=".*\S.*"
                placeholder="e.g. Creative coding"
                disabled={busy}
              />
            </label>
          )}
          <label>
            {classroom ? "Co-teacher" : "Lead teacher"}
            <select
              className="df-input"
              name={classroom ? "personId" : "teacherId"}
              required
              defaultValue=""
              disabled={busy}
            >
              <option value="">Choose a teacher</option>
              {available.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </select>
          </label>
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
            <button className="df-button" disabled={busy}>
              {busy
                ? "Saving…"
                : classroom
                  ? "Add teacher"
                  : "Create classroom"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
