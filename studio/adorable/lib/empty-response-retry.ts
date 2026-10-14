import type { createOpenAI } from "@ai-sdk/openai";
type Model = ReturnType<ReturnType<typeof createOpenAI>["chat"]>;

/** Retry only an empty, normally finished provider call. Previous tool results
 * stay in the prompt; executed tools are never replayed. Real output streams
 * immediately, and errors, truncation and cancellation are not retried. */
export function withEmptyResponseRetry(model: Model): Model {
  return new Proxy(model, {
    get(target, key) {
      if (key === "doStream")
        return async (options: Parameters<Model["doStream"]>[0]) => {
          const initial = await target.doStream(options);
          async function* events() {
            let previousUsage: unknown;
            for (let attempt = 0; attempt < 2; attempt++) {
              const result =
                attempt === 0
                  ? initial
                  : await target.doStream({
                      ...options,
                      prompt: [
                        {
                          role: "system",
                          content:
                            "Your previous response was empty. Continue the requested task using the existing tool results, or clearly explain why you cannot finish. Return visible text or a tool call.",
                        },
                        ...options.prompt,
                      ],
                    });
              const reader = result.stream.getReader();
              const pending: Awaited<
                ReturnType<typeof reader.read>
              >["value"][] = [];
              let visible = false;
              let retry = false;
              try {
                while (true) {
                  const item = await reader.read();
                  if (item.done) break;
                  const part = item.value;
                  if (
                    part.type === "error" ||
                    part.type === "tool-call" ||
                    part.type === "tool-input-start" ||
                    (part.type === "text-delta" && part.delta.trim())
                  )
                    visible = true;
                  if (
                    part.type === "finish" &&
                    !visible &&
                    attempt === 0 &&
                    !options.abortSignal?.aborted &&
                    part.finishReason.unified === "stop"
                  ) {
                    previousUsage = part.usage;
                    retry = true;
                  }
                  if (
                    part.type === "finish" &&
                    attempt === 1 &&
                    previousUsage
                  ) {
                    part.usage = sumUsage(
                      previousUsage,
                      part.usage,
                    ) as typeof part.usage;
                  }
                  if (visible || attempt === 1) {
                    for (const queued of pending.splice(0))
                      if (queued) yield queued;
                    yield part;
                  } else pending.push(part);
                }
                if (!retry) {
                  for (const part of pending) if (part) yield part;
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
