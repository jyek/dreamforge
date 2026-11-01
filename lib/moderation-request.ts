import { setTimeout as delay } from "node:timers/promises";

/** Fixed diagnostic codes only; never attach provider bodies or student content. */
export class ModerationServiceError extends Error {
  constructor(
    readonly reason:
      | "http_error"
      | "response_error"
      | "invalid_response"
      | "invalid_decision"
      | "decision_truncated"
      | "timeout"
      | "network_error",
    readonly status?: number,
  ) {
    super("Moderation service could not complete the check");
    this.name = "ModerationServiceError";
  }
}

export function moderationRetryDelay(
  value: string | null,
  now = Date.now(),
  attempt = 0,
) {
  if (value === null) return [1000, 2000, 4000][attempt] ?? null;
  const seconds = Number(value);
  const ms =
    value.trim() !== "" && Number.isFinite(seconds)
      ? seconds * 1000
      : Date.parse(value) - now;
  // Never retry before a provider's longer cooldown. Fail promptly instead.
  return Number.isFinite(ms) && ms >= 0 && ms <= 2000 ? ms : null;
}

/** Retry only rejected rate limits, at most three times within one 15s deadline.
 * Never replay an accepted generation, malformed decision or unknown network failure.
 */
export async function moderationRequest(body: string) {
  const signal = AbortSignal.timeout(15000);
  try {
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
          },
          body,
          signal,
        },
      );
      const wait = moderationRetryDelay(
        response.headers.get("retry-after"),
        Date.now(),
        attempt,
      );
      if (response.status === 429 && attempt < 3 && wait !== null) {
        await response.body?.cancel();
        await delay(wait, undefined, { signal });
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new ModerationServiceError("http_error", response.status);
      }
      let result;
      try {
        result = await response.json();
      } catch (error) {
        if (signal.aborted) throw error;
        throw new ModerationServiceError("invalid_response");
      }
      if (!result || typeof result !== "object" || Array.isArray(result))
        throw new ModerationServiceError("invalid_response");
      return result;
    }
  } catch (error) {
    if (error instanceof ModerationServiceError) throw error;
    throw new ModerationServiceError(
      signal.aborted ? "timeout" : "network_error",
    );
  }
}
