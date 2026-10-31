"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
type Person = { id: string; display_name: string };
export function SchoolSetup({
  initial,
  section,
}: {
  initial: {
    teachers: Person[];
    classes: { id: string; name: string }[];
    studentList?: Person[];
  };
  section: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/platform/school", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      form.reset();
      setMessage("Saved.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  const choices = (people: Person[]) =>
    people.map((p) => (
      <option key={p.id} value={p.id}>
        {p.display_name}
      </option>
    ));
  return (
    <div className="df-card">
      {section === "classes" && (
        <form onSubmit={submit} className="df-inline">
          <input type="hidden" name="action" value="createClass" />
          <label>
            Classroom name
            <input className="df-input" name="name" required maxLength={80} />
          </label>
          <label>
            Lead teacher
            <select className="df-input" name="teacherId" required>
              <option value="">Choose a teacher</option>
              {choices(initial.teachers)}
            </select>
          </label>
          <button className="df-button" disabled={busy}>
            Create classroom
          </button>
        </form>
      )}
      <h3>
        {section === "students"
          ? "Enroll an existing student"
          : "Assign a co-teacher"}
      </h3>
      <form onSubmit={submit} className="df-inline">
        <input
          type="hidden"
          name="action"
          value={section === "students" ? "enrollStudent" : "addTeacher"}
        />
        <label>
          Classroom
          <select className="df-input" name="classId" required>
            <option value="">Choose a classroom</option>
            {initial.classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {section === "students" ? "Student" : "Teacher"}
          <select className="df-input" name="personId" required>
            <option value="">Choose a person</option>
            {choices(
              section === "students"
                ? initial.studentList || []
                : initial.teachers,
            )}
          </select>
        </label>
        <button className="df-button" disabled={busy}>
          Assign
        </button>
      </form>
      {section === "students" && (
        <p>
          To set up a new student, give them the class code shown in the
          classroom details. They can create their account at{" "}
          <a href="/signup">Sign up</a> and join your school and classroom.
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
