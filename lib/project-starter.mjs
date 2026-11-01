import { readFileSync } from "node:fs";
/** Install the bundled, pinned starter without contacting a template host. */
export function starterInstallCommand() {
  const archive = readFileSync(
    `${process.cwd()}/config/project-starter.tar.gz`,
  ).toString("base64");
  return `mkdir -p /workspace && printf '%s' '${archive}' | base64 -d | tar -xz -C /workspace`;
}
