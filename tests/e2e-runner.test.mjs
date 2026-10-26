import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
// Exercise the CLI itself over HTTP. Provider/runtime behavior is a fixture here;
// this validates test-runner failures, not DreamForge's live deployment.
for (const mode of ["success", "reused-text-id", "tool-only", "stream-error"])
  test(`E2E runner: ${mode}`, async () => {
    const output = await mkdtemp(path.join(os.tmpdir(), "dreamforge-e2e-"));
    const histories = new Map();
    let seq = 0,
      project;
    const server = createServer(async (req, res) => {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = chunks.length
        ? JSON.parse(Buffer.concat(chunks).toString())
        : null;
      const json = (value, status = 200) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(value));
      };
      if (req.url === "/api/platform/auth" && req.method === "POST") {
        res.setHeader("Set-Cookie", "test_session=fixture; HttpOnly");
        return json({ ok: true });
      }
      if (req.url === "/preview") {
        res.writeHead(200, { "Content-Type": "text/html" });
        return res.end("<h1>DreamForge E2E Counter</h1>");
      }
      if (req.headers.cookie !== "test_session=fixture")
        return json({ error: "No session" }, 403);
      if (req.url === "/api/platform/auth")
        return json({ user: { id: "fixture", role: "child" } });
      if (req.url === "/api/projects" && req.method === "POST") {
        project = {
          id: "vm-fixture",
          name: "E2E Prompting Playground",
          previewUrl: `http://127.0.0.1:${server.address().port}/preview`,
        };
        return json({ id: project.id, project });
      }
      if (
        req.url === "/api/projects/vm-fixture/e2e" &&
        req.method === "DELETE"
      ) {
        project = null;
        histories.clear();
        return json({ removed: true, snapshotsDeleted: 1 });
      }
      if (req.url === "/api/projects")
        return json({ projects: project ? [project] : [] });
      if (req.url === "/api/projects/vm-fixture/conversations")
        return json({ conversationId: `fixture-${++seq}` });
      if (req.url.startsWith("/api/projects/vm-fixture/conversations/"))
        return json({
          messages: histories.get(req.url.split("/").at(-1)) || [],
        });
      if (req.url === "/api/projects/vm-fixture/files")
        return json({ files: ["app/page.tsx"] });
      if (req.url.startsWith("/api/projects/vm-fixture/files?"))
        return json({ content: "DreamForge E2E Counter" });
      if (req.url === "/api/projects/vm-fixture/execution")
        return json({ revision: 0 });
      if (req.url === "/api/projects/vm-fixture/runtime")
        return json({ ready: true });
      if (req.url === "/preview") {
        res.writeHead(200, { "Content-Type": "text/html" });
        return res.end("<h1>DreamForge E2E Counter</h1>");
      }
      if (req.url === "/api/chat") {
        if (req.headers.origin !== `http://127.0.0.1:${server.address().port}`)
          return json({}, 403);
        const user = body.messages[0],
          blocked = user.parts[0].text.includes("keylogger"),
          build = user.parts[0].text.includes("click counter");
        const answer = blocked
          ? "Please choose a safe project."
          : build
            ? "E2E_BUILD_COMPLETE"
            : "DREAMFORGE_E2E_READY";
        histories.set(body.conversationId, [
          {
            ...user,
            parts: blocked
              ? [{ type: "text", text: "[Request blocked by safety checks]" }]
              : user.parts,
          },
          { role: "assistant", parts: [{ type: "text", text: answer }] },
        ]);
        const events = [
          { type: "data-progress", data: { message: "Getting ready…" } },
        ];
        if (build && mode === "reused-text-id")
          events.push(
            { type: "text-start", id: "answer" },
            {
              type: "text-delta",
              id: "answer",
              delta: "I will inspect the project first.",
            },
            { type: "text-end", id: "answer" },
          );
        if (build)
          events.push({
            type: "tool-output-available",
            toolCallId: "fixture",
            output: { ok: true },
          });
        if (build && mode === "reused-text-id")
          events.push({ type: "text-start", id: "answer" });
        if (!(build && mode === "tool-only"))
          events.push({ type: "text-delta", id: "answer", delta: answer });
        if (build && mode === "stream-error")
          events.push({ type: "error", errorText: "fixture error" });
        events.push({ type: "finish" });
        const sse =
          events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") +
          "data: [DONE]\n\n";
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        // Split JSON and event delimiters across chunks, as real network streams do.
        res.write(sse.slice(0, 13));
        setTimeout(() => res.end(sse.slice(13)), 5);
        return;
      }
      json({}, 404);
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const result = await new Promise((resolve) => {
        const child = spawn(process.execPath, ["scripts/e2e-prompting.mjs"], {
          env: {
            ...process.env,
            E2E_BASE_URL: `http://127.0.0.1:${server.address().port}`,
            E2E_LOGIN: "fixture",
            E2E_PASSWORD: "fixture",
            E2E_OUTPUT: output,
          },
          stdio: ["ignore", "pipe", "pipe"],
        });
        let logs = "";
        child.stdout.on("data", (c) => (logs += c));
        child.stderr.on("data", (c) => (logs += c));
        child.on("close", (code) => resolve({ code, logs }));
      });
      const report = JSON.parse(
        await readFile(path.join(output, "latest.json"), "utf8"),
      );
      const success = mode === "success" || mode === "reused-text-id";
      assert.equal(result.code, success ? 0 : 1, result.logs);
      assert.equal(report.status, success ? "passed" : "failed");
      if (success)
        assert.equal(
          report.checks.filter((c) => c.status === "passed").length,
          8,
        );
      else
        assert.equal(
          report.checks.at(-1).name,
          "code edit, app check, final answer and saved history",
        );
      assert.equal(report.cleanup.status, "passed");
      assert.equal(
        project,
        null,
        "Test project must be removed even on failure",
      );
      await assert.rejects(() => readFile(path.join(output, "project.json")), {
        code: "ENOENT",
      });
      assert(
        !JSON.stringify(report).includes("test_session"),
        "Report must not contain authentication cookies",
      );
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await rm(output, { recursive: true, force: true });
    }
  });
