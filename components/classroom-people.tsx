import { SimpleLoading } from "./dream-loading";
import { ClassroomAvatar } from "./classroom-avatar";
export function ClassroomPeople({
  people,
  role,
  userId,
  loading = false,
}: {
  people: { id: string; display_name: string; is_owner?: boolean }[];
  role: "teacher" | "student";
  userId?: string;
  loading?: boolean;
}) {
  if (loading)
    return (
      <div className="df-class-people" aria-busy="true">
        <SimpleLoading inline label="Loading…" />
      </div>
    );
  return (
    <div className="df-class-people">
      {people.map((p) => (
        <div className="df-class-person" key={p.id}>
          <ClassroomAvatar identity={p.id} role={role} />
          <div className="df-class-person-info">
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
        </div>
      ))}
    </div>
  );
}
