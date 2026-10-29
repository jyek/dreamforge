/** Avoid guest operations while the provider is still shutting down the VM. */
export function assertWorkspaceAvailable(state: string) {
  if (state === "stopping")
    throw Object.assign(Error("Workspace is still stopping."), {
      code: "WORKSPACE_STOPPING",
    });
}

/** A cold boot loses guest processes; a resumed VM reuses its named server. */
export async function wakeVm(
  vm: { data: () => Promise<{ state: string }>; start: () => Promise<unknown> },
  startServer: () => Promise<void>,
) {
  const info = await vm.data();
  if (info.state === "paused" || info.state === "stopped") {
    const resumed = await vm.start();
    // A normal wake keeps the existing server and compilation cache. Only a
    // cold boot (including a failed memory restore) needs a new process.
    if (
      info.state === "stopped" ||
      (resumed as { memoryRestored?: boolean } | undefined)?.memoryRestored ===
        false
    )
      await startServer();
  }
}

/** Request lifecycle transitions without holding a browser poll for a minute. */
export async function resumeProjectRuntime(
  sandbox: {
    state: string;
    wake: (options: { wait: false; signal: AbortSignal }) => Promise<unknown>;
    restart: (options: {
      wait: false;
      signal: AbortSignal;
    }) => Promise<unknown>;
  },
  startServer: () => Promise<void>,
  signal: AbortSignal,
) {
  if (sandbox.state === "paused" || sandbox.state === "pausing") {
    await sandbox.wake({ wait: false, signal });
    return;
  }
  if (sandbox.state === "stopped") {
    await sandbox.restart({ wait: false, signal });
    return;
  }
  // These transitions are already in flight. The next HTTP probe checks them.
  if (["starting", "resuming", "stopping"].includes(sandbox.state)) return;
  await startServer();
}

/** A loaded proxy error page does not mean the app is ready. */
export async function previewResponding(
  previewUrl: string,
  request: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await request(previewUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    await response.body?.cancel();
    // Keep real app errors (including Next's compile-error UI) visible.
    return (
      response.headers.get("content-type")?.includes("text/html") === true &&
      ![401, 403, 409, 425, 429, 502, 503, 504].includes(response.status)
    );
  } catch {
    return false;
  }
}

export function runtimeFailure(error: unknown) {
  const failure = error as { code?: string; message?: string } | null;
  if (failure?.code === "WORKSPACE_STOPPING")
    return {
      status: 503,
      body: {
        state: "blocked",
        ready: false,
        error:
          "The workspace is still stopping. Preview, files and terminal are unavailable until project hosting completes recovery. Please contact DreamForge support if this persists.",
      },
    };
  if (failure?.code === "operation_failed" || failure?.code === "host_unknown")
    return {
      status: 503,
      body: {
        state: "blocked",
        ready: false,
        error:
          "Project hosting could not resume this workspace. Your saved files are preserved. Please contact DreamForge support.",
      },
    };
  if (failure?.code === "PROJECT_MIGRATION_REQUIRED")
    return {
      status: 409,
      body: {
        state: "blocked",
        ready: false,
        error: failure.message || "This project's files need to be migrated.",
      },
    };
  if (
    /^(INCLUDED_USAGE_USED_UP|NO_CREDIT_|QUOTA_EXCEEDED|CREDIT)/i.test(
      failure?.code || "",
    )
  )
    return {
      status: 429,
      body: {
        state: "blocked",
        ready: false,
        error:
          "Runtime's included usage or account limit has been reached. Wait for the monthly reset or add Runtime credit, then try again.",
      },
    };
  if (failure?.code === "LIMIT_EXCEEDED") {
    return {
      status: 429,
      body: {
        state: "blocked",
        ready: false,
        error: failure.message?.includes("allowance")
          ? "Your Freestyle compute allowance has been used up. Wait for it to reset or upgrade your Freestyle plan, then try again."
          : "Freestyle cannot start this VM because an account limit was reached. Check your Freestyle limits, then try again.",
      },
    };
  }
  return {
    status: 503,
    body: {
      state: "error",
      ready: false,
      error: "The VM could not start. Please try again.",
    },
  };
}
