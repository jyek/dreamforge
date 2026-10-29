import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { discoverTests, fixtureEnvironment } from "../scripts/test-suites.mjs";

test("new tests are discovered recursively and service tests stay out of the unit process", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "dreamforge-discovery-"));
  try {
    await mkdir(path.join(dir, "nested"));
    for (const [file, content] of Object.entries({
      "new.test.ts": "// new unit test",
      "nested/wallet.test.mts":
        "// @suite database\nprocess.env." + "TEST_DATABASE_URL",
      "frame.test.tsx": "// @suite browser\n",
      "fixture.mjs": "// not a test",
    }))
      await writeFile(path.join(dir, file), content);
    const suites = await discoverTests(dir);
    assert.deepEqual(suites.unit, [path.join(dir, "new.test.ts")]);
    assert.deepEqual(suites.database, [
      path.join(dir, "nested/wallet.test.mts"),
    ]);
    assert.deepEqual(suites.browser, [path.join(dir, "frame.test.tsx")]);
    await writeFile(
      path.join(dir, "unsafe.test.ts"),
      "process.env." + "TEST_DATABASE_URL",
    );
    await assert.rejects(() => discoverTests(dir), /explicit @suite/);
    await writeFile(path.join(dir, "unsafe.test.ts"), "// @suite typo");
    await assert.rejects(() => discoverTests(dir), /Unknown test suite/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("fixture environments exclude deployment credentials, Node preload hooks and feature flags", () => {
  assert.deepEqual(
    fixtureEnvironment({
      PATH: "/bin",
      DATABASE_URL: "secret",
      STRIPE_SECRET_KEY: "secret",
      NODE_OPTIONS: "--import hook.mjs",
      DREAMFORGE_PREPAID_BILLING_ENABLED: "true",
      TEST_BROWSER_EXECUTABLE: "/chrome",
    }),
    {
      NODE_ENV: "test",
      NEXT_TELEMETRY_DISABLED: "1",
      PATH: "/bin",
      TEST_BROWSER_EXECUTABLE: "/chrome",
    },
  );
});
