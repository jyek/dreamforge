import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { starterInstallCommand } from "../lib/project-starter.mjs";
test("bundled starter installs a blank Next.js workspace without a remote template", () => {
  const dir = mkdtempSync(join(tmpdir(), "dreamforge-starter-"));
  try {
    const command = starterInstallCommand();
    assert.ok(!command.includes("git clone"));
    execFileSync("sh", ["-c", command.replaceAll("/workspace", dir)]);
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    assert.ok(pkg.dependencies.next && pkg.dependencies.react);
    assert.ok(existsSync(join(dir, "package-lock.json")));
    assert.ok(existsSync(join(dir, "components/ui/button.tsx")));
    assert.match(
      readFileSync(join(dir, "app/page.tsx"), "utf8"),
      /return null/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
