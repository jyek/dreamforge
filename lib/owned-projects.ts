import type { ProjectItem } from "./project-types";
/** A viewed/shared project can be loaded without belonging in “Your projects”. */
export function ownedProjects<
  T extends Pick<ProjectItem, "ownedByCurrentUser" | "readOnly">,
>(projects: T[]): T[] {
  return projects.filter(
    (project) => project.ownedByCurrentUser ?? project.readOnly === false,
  );
}
