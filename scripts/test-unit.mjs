import { spawnSync } from "node:child_process";
import { fixtureEnvironment } from "./test-suites.mjs";

for (const args of [
  ["scripts/run-test-suite.mjs", "unit"],
  ["--import", "tsx", "tests/llm-smoke.ts"],
]) {
  const result = spawnSync(process.execPath, args, {
    env: fixtureEnvironment(),
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
