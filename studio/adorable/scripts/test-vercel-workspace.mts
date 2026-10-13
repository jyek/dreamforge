import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
import assert from "node:assert/strict";
import {
  prepareVercelTestBase,
  VercelTestWorkspace,
  VERCEL_TEST_PAGE,
} from "../lib/vercel-workspace-test";

await prepareVercelTestBase();
let workspace: VercelTestWorkspace | undefined;
try {
  workspace = await VercelTestWorkspace.create();
  await workspace.writeFile("/workspace/app/page.tsx", VERCEL_TEST_PAGE);
  await workspace.writeFile(
    "/workspace/persistence-test.txt",
    "project files survive stop and resume",
  );
  assert.match(await workspace.exec("cd /workspace && node --version"), /^v22/);
  const url = workspace.status().previewUrl;
  let response = await fetch(url);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Workspace test is running/);
  await workspace.pause();
  workspace = await VercelTestWorkspace.get(workspace.sandbox.name);
  await workspace.start();
  assert.equal(
    await workspace.readFile("/workspace/persistence-test.txt"),
    "project files survive stop and resume",
  );
  assert.equal(
    workspace.status().previewUrl,
    url,
    "Share URL must remain stable across resume",
  );
  response = await fetch(url);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Workspace test is running/);
  console.log(
    "PASS: Next.js preview, file edits, commands, persistent files, stable share URL, and dev-server restart after resume",
  );
  console.log(JSON.stringify(workspace.status()));
} finally {
  if (workspace) {
    await workspace.delete();
    console.log("Removed temporary workspace and snapshots");
  }
}
