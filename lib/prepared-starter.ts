/** Production blank projects must never silently fall back to npm install. */
export function preparedStarterSnapshot(
  sourceRepoUrl?: string,
  env: Record<string, string | undefined> = process.env,
) {
  if (sourceRepoUrl) return undefined;
  const snapshot = env.RUNTIME_BASE_SNAPSHOT?.trim();
  if (
    (!snapshot && env.VERCEL_ENV === "production") ||
    (snapshot &&
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        snapshot,
      ))
  ) {
    throw Object.assign(Error("Prepared project starter is not configured."), {
      code: "hosting_starter_not_configured",
    });
  }
  return snapshot || undefined;
}
