import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export async function discoverTests(directory = "tests") {
  const suites = { unit: [], database: [], browser: [] };
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (/\.test\.(?:[cm]?ts|tsx|[cm]?js)$/.test(entry.name)) {
        const source = await readFile(file, "utf8");
        const label = source.match(/^\/\/ @suite (\S+)\s*$/m)?.[1] || "unit";
        if (!(label in suites))
          throw Error(`Unknown test suite ${label}: ${file}`);
        if (
          label === "unit" &&
          /process\.env\.TEST_DATABASE_URL|import\s+["']dotenv\/config/.test(
            source,
          )
        )
          throw Error(
            `Database/environment-dependent test needs an explicit @suite label: ${file}`,
          );
        suites[label].push(file);
      }
    }
  }
  await visit(directory);
  for (const files of Object.values(suites)) files.sort();
  return suites;
}

export function fixtureEnvironment(source = process.env) {
  const env = { NODE_ENV: "test", NEXT_TELEMETRY_DISABLED: "1" };
  for (const key of [
    "PATH",
    "HOME",
    "USERPROFILE",
    "TMPDIR",
    "TMP",
    "TEMP",
    "SystemRoot",
    "SYSTEMROOT",
    "COMSPEC",
    "WINDIR",
    "LANG",
    "LC_ALL",
    "TZ",
    "CI",
    "FORCE_COLOR",
    "NO_COLOR",
    "TEST_BROWSER_EXECUTABLE",
  ])
    if (source[key] !== undefined) env[key] = source[key];
  return env;
}
