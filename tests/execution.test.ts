// @suite database
import { APPLICATION_DATABASE_OPTIONS } from "../lib/database-options.mjs";
import assert from "node:assert/strict";
import { test, after } from "node:test";
import pg from "pg";
import { randomUUID } from "node:crypto";
import {
  beginRun,
  finishRun,
  executionContext,
  assertRun,
  markEdit,
  executionState,
  ExecutionError,
  snapshotInProgress,
  invalidateManualEdit,
  ensureRunSnapshot,
} from "../lib/execution";
import {
  verifyApp,
  verificationPassed,
  interactionSchema,
} from "../lib/verification";
import { studentTools } from "../lib/student-tools";
import type { Vm } from "../lib/project-runtime";
const pool = new pg.Pool({options: APPLICATION_DATABASE_OPTIONS, connectionString: process.env.TEST_DATABASE_URL });
(globalThis as unknown as { dreamforgePool: pg.Pool }).dreamforgePool = pool;
after(() => pool.end());
const begin = (
  project: string,
  revision = 0,
  snapshot = async () => `snapshot-${randomUUID()}`,
) =>
  beginRun(
    project,
    randomUUID(),
    revision,
    new AbortController().signal,
    snapshot,
  );

test("preview wake guard lasts until the captured snapshot is saved", async () => {
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const capture = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = begin("vm-snapshot-wake-guard", 0, async () => {
    entered();
    await capture;
    return "captured-without-preview-wake";
  });
  await started;
  assert.equal(await snapshotInProgress("vm-snapshot-wake-guard"), true);
  release();
  const run = await pending;
  assert.equal(await snapshotInProgress("vm-snapshot-wake-guard"), false);
  await finishRun(run, "completed");
});
test("concurrent API workers get one durable project edit lock", async () => {
  const result = await Promise.allSettled([
    begin("vm-concurrent"),
    begin("vm-concurrent"),
  ]);
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  const run = (
    result.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<
      Awaited<ReturnType<typeof begin>>
    >
  ).value;
  assert.equal((await executionState("vm-concurrent")).activeRun, run.id);
  await finishRun(run, "completed");
  const recovered = await executionState("vm-concurrent");
  assert.equal(recovered.activeRun, null);
  assert.equal(recovered.runs[0].snapshot_id?.startsWith("snapshot-"), true);
  assert.deepEqual(
    recovered.events.map((e) => e.kind),
    ["run.started", "snapshot.started", "snapshot.saved", "run.completed"],
  );
});
test("writes invalidate verification before filesystem changes and reject stale revisions", async () => {
  const run = await begin("vm-revisions");
  await pool.query(
    "update project_execution set verification=$2 where project_id=$1",
    [run.projectId, { revision: 0, ok: true, humanTested: true }],
  );
  await executionContext.run(run, () => markEdit("app/page.tsx"));
  const state = await executionState(run.projectId);
  assert.equal(state.revision, 1);
  assert.equal(state.verification, null);
  await finishRun(run, "completed");
  await assert.rejects(() => begin(run.projectId, 0), ExecutionError);
  const next = await begin(run.projectId, 1);
  await finishRun(next, "completed");
});
test("Stop is durable and prevents subsequent tool writes", async () => {
  const run = await begin("vm-cancel");
  await pool.query(
    "update execution_runs set cancel_requested=true where id=$1",
    [run.id],
  );
  await assert.rejects(() =>
    executionContext.run(run, () => markEdit("app/page.tsx")),
  );
  assert.equal(run.signal.aborted, true);
  await finishRun(run, "completed");
  const state = await executionState(run.projectId);
  assert.equal(state.revision, 0);
  assert.equal(state.runs[0].state, "cancelled");
});
test("a disconnected stream cannot release the lock while a tool is still running", async () => {
  const run = await begin("vm-pending");
  let release!: () => void;
  const work = new Promise<void>((resolve) => {
    release = resolve;
  });
  run.pending.add(work);
  const ending = finishRun(run, "cancelled");
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal((await executionState(run.projectId)).activeRun, run.id);
  release();
  await ending;
  assert.equal((await executionState(run.projectId)).activeRun, null);
});
test("expired workers require explicit recovery; a timeout cannot silently permit concurrent edits", async () => {
  const run = await begin("vm-expired");
  await pool.query(
    "update execution_runs set deadline=now()-interval '1 minute' where id=$1",
    [run.id],
  );
  await assert.rejects(() => assertRun(run));
  await assert.rejects(() => begin(run.projectId), ExecutionError);
  await finishRun(run, "cancelled");
});
test("snapshot failure does not leave an edit lock", async () => {
  await assert.rejects(() =>
    begin("vm-snapshotfail", 0, async () => {
      throw Error("snapshot unavailable");
    }),
  );
  const state = await executionState("vm-snapshotfail");
  assert.equal(state.activeRun, null);
  assert.equal(state.runs[0].state, "failed");
});
test("HTTP availability and compiler success alone never establish verified or human-tested status", async () => {
  const run = await begin("vm-verification");
  delete process.env.VERIFICATION_BROWSER_WS;
  const vm = {
    exec: async () => ({ statusCode: 0, stdout: "", stderr: "" }),
  } as unknown as Vm;
  const result = await executionContext.run(run, () => verifyApp(vm, []));
  assert.equal(result.compilation, "passed");
  assert.equal(result.pageLoaded, false);
  assert.equal(result.ok, false);
  assert.equal(result.humanTested, false);
  assert.equal(result.rendering, "not-run");
  assert.equal((await executionState(run.projectId)).verification.revision, 0);
  await executionContext.run(run, () => markEdit("app/page.tsx"));
  assert.equal((await executionState(run.projectId)).verification, null);
  await finishRun(run, "completed");
  assert.equal(
    verificationPassed({
      compilation: "passed",
      rendering: "passed",
      runtimeErrors: ["error"],
      interactions: [],
    }),
    false,
  );
  assert.equal(
    verificationPassed({
      compilation: "passed",
      rendering: "passed",
      runtimeErrors: [],
      interactions: [{ passed: false }],
    }),
    false,
  );
  assert.throws(() =>
    interactionSchema.parse(
      Array(9).fill({ button: "Add one", expectedText: "1" }),
    ),
  );
});
test("safe tools cannot edit server routes, traverse paths, use shell, or bypass the run guard", async () => {
  const run = await begin("vm-toolguards");
  let writes = 0;
  const vm = {
    exec: async () => ({ statusCode: 0 }),
    fs: {
      writeTextFile: async () => {
        writes++;
      },
    },
  } as unknown as Vm;
  const tools = studentTools(vm, run.projectId, null, []);
  assert.equal("bashTool" in tools, false);
  for (const file of ["app/../secret.ts", "app/api/route.ts", "app/route.ts"])
    await assert.rejects(async () =>
      executionContext.run(run, async () =>
        tools.writeFileTool.execute!({ file, content: "safe" }, {} as never),
      ),
    );
  await assert.rejects(async () =>
    executionContext.run(run, async () =>
      tools.writeFileTool.execute!(
        { file: "app/page.tsx", content: "fetch('https://outside.test')" },
        {} as never,
      ),
    ),
  );
  assert.equal(writes, 0);
  await finishRun(run, "cancelled");
  await assert.rejects(async () =>
    executionContext.run(run, async () =>
      tools.writeFileTool.execute!(
        { file: "app/page.tsx", content: "safe" },
        {} as never,
      ),
    ),
  );
});
test("browser roles cannot read execution events, snapshots or teacher approval records", async () => {
  const db = await pool.connect();
  try {
    for (const role of ["anon", "authenticated"]) {
      await db.query(`set role ${role}`);
      for (const table of [
        "project_execution",
        "execution_runs",
        "execution_events",
        "approved_shares",
      ])
        await assert.rejects(
          () => db.query(`select * from dreamforge.${table}`),
          /permission denied/,
        );
      await db.query("reset role");
    }
  } finally {
    await db.query("reset role");
    db.release();
  }
});

test("real browser evidence: three clicks, reset, another click; failed expectations and runtime errors stay failed", async () => {
  const { createServer } = await import("node:http");
  const { chromium } = await import("playwright-core");
  const { existsSync } = await import("node:fs");
  const executable =
    process.env.TEST_BROWSER_EXECUTABLE ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  assert.ok(
    existsSync(executable),
    "Set TEST_BROWSER_EXECUTABLE to run browser evidence tests.",
  );
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end(
      `<button onclick="score.textContent=++count">Add one</button><button onclick="score.textContent=count=0">Reset</button><p id="score">0</p><script>let count=0;${req.url === "/broken" ? 'setTimeout(()=>{throw Error("fixture")},50);' : ""}</script>`,
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
  const vm = { exec: async () => ({ statusCode: 0 }) } as unknown as Vm;
  process.env.VERIFICATION_BROWSER_WS = "fixture";
  let browserServer: import("playwright-core").BrowserServer | undefined;
  const services = (path = "/") => ({
    preview: async () => ({
      url: origin + path,
      baseUrl: origin,
      token: null,
      expiresAt: null,
    }),
    connect: async () =>
      chromium.connect(browserServer!.wsEndpoint(), { timeout: 8000 }),
  });
  try {
    // Browser startup belongs to fixture setup, not the app's bounded browser
    // connection check. A slow launch otherwise outlives that check and leaks
    // its eventual browser, keeping the test worker alive after an assertion.
    // Each connection still creates and closes its own isolated context.
    browserServer = await chromium.launchServer({
      executablePath: executable,
      headless: true,
      timeout: 30000,
    });
    const run = await begin("vm-realbrowser");
    const steps = [
      { button: "Add one", expectedText: "1" },
      { button: "Add one", expectedText: "2" },
      { button: "Add one", expectedText: "3" },
      { button: "Reset", expectedText: "0" },
      { button: "Add one", expectedText: "1" },
    ];
    const good = await executionContext.run(run, () =>
      verifyApp(vm, steps, services()),
    );
    assert.equal(good.ok, true, JSON.stringify(good));
    assert.equal(good.pageLoaded, true);
    assert.equal(good.interactions.length, 5);
    assert.equal(good.humanTested, false);
    assert.ok(good.screenshotHash);
    const wrong = await executionContext.run(run, () =>
      verifyApp(vm, [{ button: "Add one", expectedText: "4" }], services()),
    );
    assert.equal(wrong.ok, false);
    assert.equal(wrong.interactions[0].passed, false);
    const broken = await executionContext.run(run, () =>
      verifyApp(vm, [], services("/broken")),
    );
    assert.equal(broken.ok, false);
    assert.ok(broken.runtimeErrors.length > 0);
    await finishRun(run, "completed");
  } finally {
    delete process.env.VERIFICATION_BROWSER_WS;
    try {
      await browserServer?.close();
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
});

test("an unconfirmed guest process keeps the lock until explicit recovery", async () => {
  const run = await begin("vm-uncertain-process");
  run.unsafeToUnlock = true;
  await finishRun(run, "cancelled");
  const state = await executionState(run.projectId);
  assert.equal(state.activeRun, run.id);
  assert.equal(state.runs[0].state, "interrupted");
  await assert.rejects(() => begin(run.projectId), ExecutionError);
});

test("stalled browser page creation fails verification and cleans up within a bounded time", async () => {
  const run = await begin("vm-browser-stall");
  let closed = 0;
  process.env.VERIFICATION_BROWSER_WS = "fixture";
  const vm = { exec: async () => ({ statusCode: 0 }) } as unknown as Vm;
  const browser = {
    newContext: async () => ({
      newPage: () => new Promise(() => {}),
      route: async () => {},
      close: async () => {
        closed++;
      },
    }),
    close: async () => {
      closed++;
    },
  };
  const services = {
    preview: async () => ({
      url: "http://127.0.0.1",
      baseUrl: "http://127.0.0.1",
      token: null,
      expiresAt: null,
    }),
    connect: async () =>
      browser as unknown as import("playwright-core").Browser,
  };
  try {
    const result = await executionContext.run(run, () =>
      verifyApp(vm, [], services, 10),
    );
    assert.equal(result.ok, false);
    assert.equal(result.rendering, "failed");
    assert.equal(result.unavailable, "Browser check did not complete.");
    assert.equal(closed, 2);
  } finally {
    delete process.env.VERIFICATION_BROWSER_WS;
    await finishRun(run, "completed");
  }
});

test("manual terminal edits invalidate evidence and cannot overlap an AI run", async () => {
  const project = "vm-manual-terminal";
  const first = await begin(project);
  await finishRun(first, "completed");
  await pool.query(
    "update project_execution set verification=$2 where project_id=$1",
    [project, JSON.stringify({ revision: 0, ok: true })],
  );
  await invalidateManualEdit(project);
  const edited = await executionState(project);
  assert.equal(edited.revision, 1);
  assert.equal(edited.verification, null);
  const active = await begin(project, 1);
  try {
    await assert.rejects(invalidateManualEdit(project), /active coding run/);
    assert.equal((await executionState(project)).revision, 1);
  } finally {
    await finishRun(active, "completed");
  }
});

test("conversation-only runs skip runtime preparation; concurrent tools capture once before editing", async () => {
  let captures = 0;
  const run = await beginRun(
    "vm-lazy-snapshot",
    randomUUID(),
    0,
    new AbortController().signal,
    async () => {
      captures++;
      return "lazy-snapshot";
    },
    true,
  );
  assert.equal(captures, 0);
  assert.equal(await snapshotInProgress(run.projectId), false);
  assert.equal((await executionState(run.projectId)).runs[0].snapshot_id, null);
  await Promise.all([ensureRunSnapshot(run), ensureRunSnapshot(run)]);
  assert.equal(captures, 1);
  assert.equal(
    (await executionState(run.projectId)).runs[0].snapshot_id,
    "lazy-snapshot",
  );
  await executionContext.run(run, () => markEdit("app/page.tsx"));
  assert.equal(captures, 1);
  await finishRun(run, "completed");
});

test("failed lazy snapshots prevent edits and leave the revision unchanged", async () => {
  const run = await beginRun(
    "vm-lazy-failure",
    randomUUID(),
    0,
    new AbortController().signal,
    async () => {
      throw Error("snapshot unavailable");
    },
    true,
  );
  await assert.rejects(() =>
    executionContext.run(run, () => markEdit("app/page.tsx")),
  );
  assert.equal((await executionState(run.projectId)).revision, 0);
  await finishRun(run, "failed");
  assert.equal((await executionState(run.projectId)).activeRun, null);
});

test("managed chat returns progress while preflight waits, without touching the runtime", async () => {
  const { managedChat } = await import("../lib/managed-chat");
  const keys = [
    "DREAMFORGE_AUTH_ENABLED",
    "STUDENT_LOGIN_ENABLED",
    "SAFETY_ENABLED",
  ] as const;
  const saved = keys.map((k) => process.env[k]);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    process.env.DREAMFORGE_AUTH_ENABLED = "false";
    process.env.STUDENT_LOGIN_ENABLED = "false";
    process.env.SAFETY_ENABLED = "false";
    const response = await managedChat(
      new Request("https://app.test/api/chat", {
        method: "POST",
        headers: {
          origin: "https://app.test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId: "vm-startupstream",
          conversationId: randomUUID(),
          revision: 0,
          messages: [],
        }),
      }),
      async () => {
        await gate;
        return new Response(
          'data: {"type":"start","messageId":"test"}\n\ndata: {"type":"finish","finishReason":"stop"}\n\ndata: [DONE]\n\n',
        );
      },
      { authorize: async () => true, identity: async () => true },
    );
    assert.equal(response.status, 200);
    const reader = response.body!.getReader();
    assert.match(
      new TextDecoder().decode((await reader.read()).value),
      /Checking your request/,
    );
    const during = await executionState("vm-startupstream");
    assert.ok(during.activeRun);
    assert.equal(during.runs[0].snapshot_id, null);
    release();
    while (!(await reader.read()).done) {}
    const after = await executionState("vm-startupstream");
    assert.equal(after.activeRun, null);
    assert.equal(after.runs[0].state, "completed");

    const cancelled = await managedChat(
      new Request("https://app.test/api/chat", {
        method: "POST",
        headers: {
          origin: "https://app.test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId: "vm-startupcancel",
          conversationId: randomUUID(),
          revision: 0,
          messages: [],
        }),
      }),
      async () => {
        const { currentRun } = await import("../lib/execution");
        const signal = currentRun()!.signal;
        await new Promise<void>((resolve) => {
          if (signal.aborted) resolve();
          else
            signal.addEventListener("abort", () => resolve(), { once: true });
        });
        return new Response("unused");
      },
      { authorize: async () => true, identity: async () => true },
    );
    const cancelledReader = cancelled.body!.getReader();
    await cancelledReader.read();
    await cancelledReader.cancel();
    const stopped = await executionState("vm-startupcancel");
    assert.equal(stopped.activeRun, null);
    assert.equal(stopped.runs[0].state, "cancelled");
  } finally {
    release();
    keys.forEach((k, i) => {
      if (saved[i] === undefined) delete process.env[k];
      else process.env[k] = saved[i];
    });
  }
});

test("file reads work without a snapshot; first source write takes exactly one", async () => {
  const { createTools } = await import("../lib/create-tools");
  let captures = 0,
    writes = 0;
  const run = await beginRun(
    "vm-readwithoutbackup",
    "00000000-0000-4000-8000-000000000099",
    0,
    new AbortController().signal,
    async () => {
      captures++;
      return "snapshot-fixture";
    },
    true,
  );
  const vm = {
    fs: {
      readTextFile: async () => "current source",
      writeTextFile: async () => {
        writes++;
      },
    },
  };
  await executionContext.run(run, async () => {
    const tools = createTools(vm as any);
    const read = await (tools.readFileTool.execute as any)(
      { file: "app/page.tsx" },
      {},
    );
    assert.equal(read.content, "current source");
    assert.equal(captures, 0);
    await (tools.writeFileTool.execute as any)(
      { file: "app/page.tsx", content: "new source" },
      {},
    );
    await (tools.writeFileTool.execute as any)(
      { file: "app/page.tsx", content: "next source" },
      {},
    );
    assert.equal(captures, 1);
    assert.equal(writes, 2);
  });
  await finishRun(run, "completed");
});

test("ended streams with truncated, incomplete or missing completion are never recorded completed", async () => {
  const { managedChat } = await import("../lib/managed-chat");
  const keys = [
    "DREAMFORGE_AUTH_ENABLED",
    "STUDENT_LOGIN_ENABLED",
    "SAFETY_ENABLED",
  ];
  const saved = keys.map((k) => process.env[k]);
  try {
    keys.forEach((k) => {
      process.env[k] = "false";
    });
    const cases = [
      'data: {"type":"finish","finishReason":"length"}\n\n',
      'data: {"type":"data-run-outcome","data":{"status":"incomplete"}}\n\ndata: {"type":"finish","finishReason":"stop"}\n\n',
      'data: {"type":"text-start","id":"unfinished"}\n\n',
    ];
    for (let i = 0; i < cases.length; i++) {
      const projectId = `vm-incomplete${i}`;
      const response = await managedChat(
        new Request("https://app.test/api/chat", {
          method: "POST",
          headers: {
            origin: "https://app.test",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            projectId,
            conversationId: randomUUID(),
            revision: 0,
            messages: [],
          }),
        }),
        async () => new Response(cases[i] + "data: [DONE]\n\n"),
        { authorize: async () => true, identity: async () => true },
      );
      await response.text();
      const state = await executionState(projectId);
      assert.equal(state.runs[0].state, "failed");
      assert.equal(state.activeRun, null);
    }
  } finally {
    keys.forEach((k, i) => {
      if (saved[i] === undefined) delete process.env[k];
      else process.env[k] = saved[i];
    });
  }
});

test("screenshot infrastructure failure preserves observed browser and button evidence", async () => {
  const run = await begin("vm-screenshot-failure");
  const saved = process.env.VERIFICATION_BROWSER_WS;
  process.env.VERIFICATION_BROWSER_WS = "fixture";
  let closed = 0;
  const page = {
    setDefaultTimeout() {},
    on() {},
    goto: async () => ({ status: () => 200 }),
    locator: () => ({ innerText: async () => "Counter 0" }),
    getByRole: () => ({ click: async () => {} }),
    getByText: () => ({ waitFor: async () => {} }),
    screenshot: async () => {
      throw Error("Private browser infrastructure detail");
    },
  };
  const browser = {
    newContext: async () => ({
      newPage: async () => page,
      close: async () => {
        closed++;
      },
    }),
    close: async () => {
      closed++;
    },
  };
  try {
    const result = await executionContext.run(run, () =>
      verifyApp(
        { exec: async () => ({ statusCode: 0 }) } as unknown as Vm,
        [{ button: "Add one", expectedText: "1" }],
        {
          connect: async () =>
            browser as unknown as import("playwright-core").Browser,
          preview: async () => ({
            url: "http://fixture",
            baseUrl: "http://fixture",
            token: null,
            expiresAt: null,
          }),
        },
      ),
    );
    assert.equal(result.pageLoaded, true);
    assert.equal(result.rendering, "passed");
    assert.equal(result.interactions[0].passed, true);
    assert.equal(result.screenshotStatus, "unavailable");
    assert.equal(result.screenshotHash, null);
    assert.equal(result.unavailable, null);
    assert.equal(result.ok, true);
    assert.equal(closed, 2);
  } finally {
    if (saved === undefined) delete process.env.VERIFICATION_BROWSER_WS;
    else process.env.VERIFICATION_BROWSER_WS = saved;
    await finishRun(run, "completed");
  }
});
