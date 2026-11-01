"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PeopleToolbar } from "./people-toolbar";
type Classroom = { id: string; name: string };
export type SchoolStudent = {
  id: string;
  display_name: string;
  username: string;
  project_count: number;
  classrooms: Classroom[];
};
export function SchoolStudents({
  students,
  classrooms,
}: {
  students: SchoolStudent[];
  classrooms: Classroom[];
}) {
  const router = useRouter();
  const [classFilter, setClassFilter] = useState("");
  const [rows, setRows] = useState(students);
  const [editing, setEditing] = useState<{
    studentId: string;
    action: "enrollStudent" | "removeStudent";
  } | null>(null);
  const [classId, setClassId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => setRows(students), [students]);
  function open(studentId: string, action: "enrollStudent" | "removeStudent") {
    setEditing({ studentId, action });
    setClassId("");
    setError("");
    setMessage("");
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editing || !classId || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/platform/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: editing.action === "enrollStudent" ? "add" : "remove",
          role: "student",
          identifier: rows.find((s) => s.id === editing.studentId)?.username,
          personId: editing.studentId,
          classId,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not update classroom membership.");
      const classroom = classrooms.find((c) => c.id === classId)!;
      setRows((current) =>
        current.map((student) =>
          student.id !== editing.studentId
            ? student
            : {
                ...student,
                classrooms:
                  editing.action === "enrollStudent"
                    ? [...student.classrooms, classroom]
                    : student.classrooms.filter((c) => c.id !== classId),
              },
        ),
      );
      setMessage(
        editing.action === "enrollStudent"
          ? `Student assigned to ${classroom.name}.`
          : `Student removed from ${classroom.name}.`,
      );
      setEditing(null);
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not update classroom membership.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PeopleToolbar
        role="student"
        classrooms={classrooms}
        filter={classFilter}
        onFilter={setClassFilter}
      />
      <div className="df-guidance-table df-school-student-directory df-people-directory">
        <table className="df-table">
          <thead>
            <tr>
              <th scope="col">Student</th>
              <th scope="col">Projects</th>
              <th scope="col">Classrooms</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .filter(
                (s) =>
                  !classFilter ||
                  s.classrooms.some((c) => c.id === classFilter),
              )
              .map((student) => {
                const available = classrooms.filter(
                  (c) =>
                    !student.classrooms.some((member) => member.id === c.id),
                );
                const active = editing?.studentId === student.id;
                const options =
                  editing?.action === "removeStudent"
                    ? student.classrooms
                    : available;
                return (
                  <tr key={student.id}>
                    <td>
                      <div className="df-directory-person">
                        <div>
                          <strong>{student.display_name}</strong>
                          <small>@{student.username}</small>
                        </div>
                      </div>
                    </td>
                    <td>{student.project_count}</td>
                    <td>
                      <div className="df-directory-classes">
                        {student.classrooms.length ? (
                          student.classrooms.map((c) => (
                            <span key={c.id} className="df-guidance-tag">
                              {c.name}
                            </span>
                          ))
                        ) : (
                          <span className="df-muted">
                            No classrooms assigned
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      {active ? (
                        <form
                          className="df-student-membership-form"
                          onSubmit={save}
                        >
                          <label>
                            {editing.action === "removeStudent"
                              ? "Remove from classroom"
                              : "Assign to classroom"}
                            <select
                              className="df-input"
                              value={classId}
                              onChange={(e) => setClassId(e.target.value)}
                              required
                              disabled={busy}
                              aria-label={`${editing.action === "removeStudent" ? "Remove" : "Assign"} ${student.display_name} classroom`}
                            >
                              <option value="">Choose a classroom</option>
                              {options.map((c) => (
                                <option value={c.id} key={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="df-inline">
                            <button
                              className="df-button small"
                              disabled={busy || !classId}
                            >
                              {busy
                                ? "Saving…"
                                : editing.action === "removeStudent"
                                  ? "Remove"
                                  : "Assign"}
                            </button>
                            <button
                              type="button"
                              className="df-button secondary small"
                              disabled={busy}
                              onClick={() => {
                                setEditing(null);
                                setError("");
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                          {error && <p role="alert">{error}</p>}
                        </form>
                      ) : (
                        <div className="df-inline">
                          <button
                            type="button"
                            className="df-button secondary small"
                            disabled={busy || !available.length}
                            onClick={() => open(student.id, "enrollStudent")}
                            aria-label={`Assign ${student.display_name} to a classroom`}
                          >
                            Assign
                          </button>
                          <button
                            type="button"
                            className="df-button secondary small"
                            disabled={busy || !student.classrooms.length}
                            onClick={() => open(student.id, "removeStudent")}
                            aria-label={`Remove ${student.display_name} from a classroom`}
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            {!rows.filter(
              (s) =>
                !classFilter || s.classrooms.some((c) => c.id === classFilter),
            ).length && (
              <tr>
                <td colSpan={4} className="df-directory-empty">
                  {classFilter
                    ? "No students in this classroom."
                    : "No students yet. Use Add student to get started."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {message && <p role="status">{message}</p>}
    </>
  );
}
