/** A cold boot loses guest processes; a resumed VM reuses its named server. */
export async function wakeVm(
  vm: { data: () => Promise<{ state: string }>; start: () => Promise<unknown> },
  startServer: () => Promise<void>,
) {
  const info = await vm.data();
  if (info.state === "paused" || info.state === "stopped") {
    await vm.start();
    await startServer();
  }
}

/** A loaded proxy error page does not mean the app is ready. */
export async function previewResponding(
  previewUrl: string,
  request: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await request(previewUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    await response.body?.cancel();
    // Keep real app errors (including Next's compile-error UI) visible.
    return ![502, 503, 504].includes(response.status);
  } catch {
    return false;
  }
}

export function runtimeFailure(error: unknown) {
  const failure = error as { code?: string; message?: string } | null;
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
