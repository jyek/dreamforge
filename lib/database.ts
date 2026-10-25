import { readFileSync } from "node:fs";
import { Pool } from "pg";
const globalDb = globalThis as unknown as { dreamforgePool?: Pool };
export function database() {
  if (!process.env.DATABASE_URL) throw new Error("Database connection is not configured. Ask your teacher to finish setup.");
  const connection = new URL(process.env.DATABASE_URL);
  // pg connection-string SSL flags otherwise replace the verified CA configuration.
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) connection.searchParams.delete(key);
  return globalDb.dreamforgePool ??= new Pool({ connectionString: connection.toString(), max: 3, idleTimeoutMillis: 10000, allowExitOnIdle: true, connectionTimeoutMillis: 5000, ssl: { rejectUnauthorized: true, ca: readFileSync(`${process.cwd()}/config/supabase-ca.crt`, "utf8") } });
}
