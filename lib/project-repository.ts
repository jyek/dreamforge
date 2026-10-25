export function publicGithubRepository(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return;
  if (typeof value !== "string") throw Error("Use a public GitHub repository in owner/repository format.");
  const repository = value.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "").replace(/\.git$/, "");
  if (!repository) return;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || repository.split("/").some(p => p === "." || p === ".."))
    throw Error("Use a public GitHub repository in owner/repository format.");
  return `https://github.com/${repository}`;
}
