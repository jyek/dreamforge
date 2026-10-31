"use client";
import { useEffect, useState } from "react";
import { GroupDialog } from "./assistant-ui/group-dialog";
export function ClassroomGroups({ classId }: { classId: string }) {
  const [projects, setProjects] = useState<
      { id: string; name: string; owner: string }[]
    >([]),
    [error, setError] = useState("");
  useEffect(() => {
    let stopped = false;
    fetch(`/api/platform/classes/${classId}/groups`)
      .then(async (r) => {
        if (!r.ok) throw Error("Could not load classroom groups.");
        return r.json();
      })
      .then((d) => {
        if (!stopped) setProjects(d.projects);
      })
      .catch((e) => {
        if (!stopped) setError(e.message);
      });
    return () => {
      stopped = true;
    };
  }, [classId]);
  return (
    <section>
      <h3>Group projects</h3>
      <p>
        Choose a student’s project to assign classmates and manage who is
        editing. Each group stays within one classroom.
      </p>
      {error && <p role="alert">{error}</p>}
      {projects.map((p) => (
        <div className="df-school-row" key={p.id}>
          <strong>{p.name || "Untitled project"}</strong>
          <span>{p.owner}</span>
          <GroupDialog project={p} classId={classId} />
        </div>
      ))}
      {!projects.length && !error && (
        <p>
          No student projects yet. Students can create an individual project
          first, then you can assign its group here.
        </p>
      )}
    </section>
  );
}
