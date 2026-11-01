/** Fixed, non-sensitive facts about why a model run stopped. Never includes
 * error messages, provider response bodies, prompts or source code. */
export function describeStreamFailure(
  kind: "error" | "abort",
  error: unknown,
  model?: string,
  step?: number,
) {
  const e = (error && typeof error === "object" ? error : {}) as {
    name?: unknown;
    statusCode?: unknown;
    code?: unknown;
    isRetryable?: unknown;
    cause?: unknown;
  };
  const cause = (e.cause && typeof e.cause === "object" ? e.cause : {}) as {
    name?: unknown;
    code?: unknown;
  };
  const token = (value: unknown) =>
    typeof value === "string" && /^[A-Za-z0-9_.:/-]{1,80}$/.test(value)
      ? value
      : undefined;
  return {
    kind,
    errorName: token(e.name),
    status: typeof e.statusCode === "number" ? e.statusCode : undefined,
    code: token(e.code),
    retryable: typeof e.isRetryable === "boolean" ? e.isRetryable : undefined,
    causeName: token(cause.name),
    causeCode: token(cause.code),
    model: token(model),
    step,
  };
}
