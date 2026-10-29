import { spawnSync } from "node:child_process";
import { discoverTests, fixtureEnvironment } from "./test-suites.mjs";

const suite = process.argv[2];
const files = (await discoverTests())[suite];
if (!files?.length) throw Error(`Unknown or empty test suite: ${suite}`);
const env = fixtureEnvironment();
if (suite === "database") {
  const url = new URL(process.env.TEST_DATABASE_URL || "missing:");
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    (url.username !== "harness_test" &&
      !/^\/dreamforge_test_[a-f0-9]{32}$/.test(url.pathname))
  )
    throw Error(
      "Database tests require the isolated local harness_test cluster. Run npm run test:database.",
    );
  env.TEST_DATABASE_URL = url.toString();
  env.DATABASE_URL = url.toString();
  env.PGOPTIONS = process.env.PGOPTIONS;
}
console.log(`Running ${files.length} discovered ${suite} test files`);
const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", "--test-timeout=120000", ...files],
  { env, stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
