"use client";
import { StudentReviewTable } from "./student-review-table";

import { useState } from "react";
import { PeopleToolbar } from "./people-toolbar";
export type DirectoryTeacher = {
  id: string;
  display_name: string;
  username: string;
  is_admin: boolean;
  classrooms: { id: string; name: string }[];
};
export function SchoolTeachers({
  teachers,
  classrooms,
}: {
  teachers: DirectoryTeacher[];
  classrooms: { id: string; name: string }[];
}) {
  const [filter, setFilter] = useState("");
  const shown = teachers.filter(
    (t) => !filter || t.classrooms.some((c) => c.id === filter),
  );
  return (
    <>
      <PeopleToolbar
        role="teacher"
        classrooms={classrooms}
        filter={filter}
        onFilter={setFilter}
      />
      <StudentReviewTable
        columns={3}
        compact={false}
        className="df-people-directory"
      >
        <thead>
          <tr>
            <th>Teacher</th>
            <th>Role</th>
            <th>Classrooms</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((t) => (
            <tr key={t.id}>
              <td>
                <strong>{t.display_name}</strong>
                <small className="df-person-username">@{t.username}</small>
              </td>
              <td>
                <span className="df-guidance-tag">
                  {t.is_admin ? "School Admin" : "Teacher"}
                </span>
              </td>
              <td>
                <div className="df-directory-classes">
                  {t.classrooms.length ? (
                    t.classrooms.map((c) => (
                      <a
                        className="df-class-text-link"
                        href={`/classrooms/${c.id}`}
                        key={c.id}
                      >
                        {c.name}
                      </a>
                    ))
                  ) : (
                    <span className="df-muted">No classrooms assigned</span>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {!shown.length && (
            <tr>
              <td colSpan={3}>
                No teachers{filter ? " in this classroom" : ""}.
              </td>
            </tr>
          )}
        </tbody>
      </StudentReviewTable>
    </>
  );
}
