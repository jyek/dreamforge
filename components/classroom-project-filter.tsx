"use client";
export function ClassroomProjectFilter({
  people,
  value,
  onChange,
}: {
  people: { id: string; name: string; role: "teacher" | "student" }[];
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <div className="df-people-toolbar">
      <label>
        Created by
        <select
          className="df-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">All people</option>
          {(["teacher", "student"] as const).map((role) => (
            <optgroup
              label={role === "teacher" ? "Teachers" : "Students"}
              key={role}
            >
              {people
                .filter((p) => p.role === role)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
    </div>
  );
}
