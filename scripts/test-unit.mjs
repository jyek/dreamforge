import { spawnSync } from "node:child_process";

// Vercel builds inherit production credentials and feature flags. Fixture tests
// must run independently of those settings and must never use live services.
const runtimeKeys = [
  "PATH", "HOME", "USERPROFILE", "TMPDIR", "TMP", "TEMP", "SystemRoot",
  "SYSTEMROOT", "COMSPEC", "WINDIR", "LANG", "LC_ALL", "TZ", "CI",
  "FORCE_COLOR", "NO_COLOR",
];
const env = { NODE_ENV: "test", NEXT_TELEMETRY_DISABLED: "1" };
for (const key of runtimeKeys) {
  if (process.env[key] !== undefined) env[key] = process.env[key];
}
if (!process.env.npm_execpath) throw Error("Run these tests with npm run test:unit.");
for (const suite of ["test:prompting", "test:safety-unit"]) {
  const result = spawnSync(process.execPath, [process.env.npm_execpath, "run", suite], {
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
