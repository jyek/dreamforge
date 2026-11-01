import { ClassroomAvatar } from "./classroom-avatar";
export function ClassroomPeople({
  people,
  role,
  userId,
}: {
  people: { id: string; display_name: string; is_owner?: boolean }[];
  role: "teacher" | "student";
  userId?: string;
}) {
  return (
    <div className="df-class-people">
      {people.map((p) => (
        <div className="df-class-person" key={p.id}>
          <ClassroomAvatar identity={p.id} role={role} />
          <strong>{p.display_name}</strong>
          {p.id === userId ? (
            <span className="df-classmate-you">You</span>
          ) : (
            role === "teacher" && (
              <small className="df-muted">
                {p.is_owner ? "Lead teacher" : "Co-teacher"}
              </small>
            )
          )}
        </div>
      ))}
    </div>
  );
}
