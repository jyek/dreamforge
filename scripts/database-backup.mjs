import path from "node:path";

/** libpq does not expand a connection URI supplied through PGDATABASE. Pass its
 * individual destination fields privately, and exclude unrelated server keys.
 */
export function backupEnvironment(uri, caPath, source = process.env) {
  const connection = new URL(uri);
  if (
    !["postgres:", "postgresql:"].includes(connection.protocol) ||
    !connection.hostname ||
    !connection.username
  )
    throw Error("A complete PostgreSQL connection is required for backup");
  const environment = {};
  for (const name of [
    "PATH",
    "HOME",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TZ",
    "SYSTEMROOT",
    "WINDIR",
  ])
    if (source[name] !== undefined) environment[name] = source[name];
  return {
    ...environment,
    PGHOST: connection.hostname.replace(/^\[|\]$/g, ""),
    PGPORT: connection.port || "5432",
    PGUSER: decodeURIComponent(connection.username),
    PGPASSWORD: decodeURIComponent(connection.password),
    PGDATABASE: decodeURIComponent(connection.pathname.slice(1)) || "postgres",
    PGSSLMODE: "verify-full",
    PGSSLROOTCERT: path.resolve(caPath),
    PGCONNECT_TIMEOUT: "10",
  };
}
