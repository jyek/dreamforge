import type { createOpenAI } from "@ai-sdk/openai";
type Model = ReturnType<ReturnType<typeof createOpenAI>["chat"]>;
type Retry = {
  reason: "empty" | "truncated-tool";
  usage: unknown;
  prompt: Parameters<Model["doStream"]>[0]["prompt"];
};

/** At most one recovery across the run. Only retry a truncated tool if no
 * complete tool call was emitted: executing a tool must never be replayed.
 * Buffer tool argument fragments until complete so discarded JSON never becomes
 * a dangling UI tool call. Text remains streamed immediately. */
export function withEmptyResponseRetry(
  model: Model,
  beforeRetry?: (retry: Retry) => Promise<boolean | void>,
): Model {
  let recovered = false;
  return new Proxy(model, {
    get(target, key) {
      if (key === "doStream")
        return async (options: Parameters<Model["doStream"]>[0]) => {
          const initial = await target.doStream(options);
          async function* events() {
            let previousUsage: unknown;
            let accounted = false;
            let recovery: Retry["reason"] = "empty";
            for (let attempt = 0; attempt < 2; attempt++) {
              options.abortSignal?.throwIfAborted();
              const prompt: Retry["prompt"] = [
                {
                  role: "system" as const,
                  content:
                    recovery === "truncated-tool"
                      ? "The previous tool arguments were cut off at the response limit and were NOT executed. Do not repeat the large file. Write a small complete scaffold (under 100 lines), then implement the remaining features through small files or patches in later steps. Do not claim the unfinished write succeeded."
                      : "Your previous response was empty. Continue using the existing tool results, or clearly explain why you cannot finish. Return visible text or a tool call.",
                },
                ...options.prompt,
              ];
              const result =
                attempt === 0
                  ? initial
                  : await target.doStream({ ...options, prompt });
              const reader = result.stream.getReader();
              type Part = NonNullable<
                Awaited<ReturnType<typeof reader.read>>["value"]
              >;
              const pending: Part[] = [],
                toolInput: Part[] = [];
              let visible = false,
                completeTool = false,
                failed = false,
                retry = false;
              try {
                while (true) {
                  const item = await reader.read();
                  if (item.done) break;
                  const part = item.value;
                  if (
                    part.type === "tool-input-start" ||
                    part.type === "tool-input-delta" ||
                    part.type === "tool-input-end"
                  ) {
                    toolInput.push(part);
                    continue;
                  }
                  if (part.type === "tool-call") {
                    completeTool = true;
                    visible = true;
                    for (const queued of pending.splice(0)) yield queued;
                    for (const queued of toolInput.splice(0)) yield queued;
                  }
                  if (part.type === "error") {
                    failed = true;
                    visible = true;
                  }
                  if (part.type === "text-delta" && part.delta.trim())
                    visible = true;
                  if (part.type === "finish") {
                    const reason = part.finishReason.unified;
                    const truncated =
                      reason === "length" &&
                      toolInput.length > 0 &&
                      !completeTool;
                    if (
                      attempt === 0 &&
                      !recovered &&
                      !failed &&
                      !options.abortSignal?.aborted &&
                      (truncated || (!visible && reason === "stop"))
                    ) {
                      recovered = true;
                      previousUsage = part.usage;
                      recovery = truncated ? "truncated-tool" : "empty";
                      accounted =
                        (await beforeRetry?.({
                          reason: recovery,
                          usage: part.usage,
                          prompt: options.prompt,
                        })) === true;
                      options.abortSignal?.throwIfAborted();
                      retry = true;
                      break;
                    }
                    if (attempt === 1 && previousUsage && !accounted)
                      part.usage = sumUsage(
                        previousUsage,
                        part.usage,
                      ) as typeof part.usage;
                    for (const queued of toolInput.splice(0))
                      pending.push(queued);
                  }
                  if (visible || attempt === 1) {
                    for (const queued of pending.splice(0)) yield queued;
                    yield part;
                  } else pending.push(part);
                }
                if (!retry) {
                  for (const queued of pending) yield queued;
                  for (const queued of toolInput) yield queued;
                  return;
                }
              } finally {
                await reader.cancel().catch(() => {});
                reader.releaseLock();
              }
            }
          }
          const iterator = events();
          return {
            ...initial,
            stream: new ReadableStream({
              async pull(controller) {
                try {
                  const item = await iterator.next();
                  if (item.done) controller.close();
                  else controller.enqueue(item.value);
                } catch (error) {
                  controller.error(error);
                }
              },
              async cancel() {
                await iterator.return(undefined);
              },
            }),
          };
        };
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
function sumUsage(a: unknown, b: unknown): unknown {
  if (typeof a === "number" && typeof b === "number") return a + b;
  if (a && b && typeof a === "object" && typeof b === "object") {
    const left = a as Record<string, unknown>,
      right = b as Record<string, unknown>;
    return Object.fromEntries(
      [...new Set([...Object.keys(left), ...Object.keys(right)])].map((key) => [
        key,
        sumUsage(left[key], right[key]),
      ]),
    );
  }
  return b ?? a;
}
