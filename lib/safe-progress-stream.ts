import { trustedStreamError } from "./trusted-errors";
/** Only screened text segments/tool values reach the user. Raw arguments and
 * reasoning never stream. Status messages are fixed labels, not model thoughts. */
export function safeProgressStream(
  source: ReadableStream<unknown>,
  screen: (text: string) => Promise<unknown>,
  redact: (value: unknown) => unknown,
) {
  let reader: ReadableStreamDefaultReader<unknown>;
  let cancelled = false;
  return new ReadableStream<unknown>({
    async start(controller) {
      const status = (message: string) => {
        if (!cancelled)
          controller.enqueue({
            type: "data-progress",
            data: { message },
            transient: true,
          });
      };
      status("Getting ready…");
      const timer = setInterval(
        () => status("Still working on your request…"),
        8000,
      );
      reader = source.getReader();
      let text = "";
      let textId = "";
      let completeText = "";
      let segmentStarted = false;
      let bytes = 0;
      let interrupted = false;
      let interruptionMessage =
        "This request could not finish. Please try again.";
      const release = async (value: string) => {
        const safe = redact(value) as string;
        await screen(completeText + safe);
        if (cancelled) return;
        completeText += safe;
        if (safe.trim() || segmentStarted) {
          if (!segmentStarted) {
            controller.enqueue({ type: "text-start", id: textId });
            segmentStarted = true;
          }
          controller.enqueue({ type: "text-delta", id: textId, delta: safe });
        }
      };
      try {
        while (true) {
          const item = await reader.read();
          if (item.done || cancelled) break;
          const chunk = item.value as any;
          bytes += JSON.stringify(chunk).length;
          if (bytes > 500000) throw new Error("Response too large");
          // Drain the source so its completion callback can persist partial tool
          // results and append the trusted interruption status before we close.
          if (chunk.type === "error" || chunk.type === "abort") {
            interrupted = true;
            // Only a fixed, trusted harness message can replace the generic error.
            interruptionMessage =
              trustedStreamError(chunk.errorText) || interruptionMessage;
            continue;
          }
          if (chunk.type === "text-start") {
            text = "";
            textId = chunk.id;
            segmentStarted = false;
            continue;
          }
          if (chunk.type === "text-delta") {
            text += chunk.delta;
            // Batch at sentence/paragraph boundaries, never at individual tokens.
            // A moderation call covers all previously released text plus this segment.
            // Keep the unfinished sentence private, including partial credentials.
            const boundaries = [...text.matchAll(/(?:[.!?]["')\]]*\s+|\n\n)/g)];
            const boundary = boundaries.at(-1);
            const end = boundary ? boundary.index! + boundary[0].length : 0;
            if (end >= 240) {
              await release(text.slice(0, end));
              text = text.slice(end);
            }
            continue;
          }
          if (chunk.type === "text-end") {
            if (text) await release(text);
            if (segmentStarted && !cancelled)
              controller.enqueue({ type: "text-end", id: textId });
            segmentStarted = false;
            completeText += "\n";
            text = "";
            continue;
          }
          if (chunk.type === "tool-input-start") {
            const labels: Record<string, string> = {
              readFileTool: "Reading project files…",
              listFilesTool: "Looking through the project…",
              writeFileTool: "Preparing a file update…",
              checkAppTool: "Checking the app…",
            };
            status(labels[chunk.toolName] || "Working on the project…");
            continue;
          }
          if (
            chunk.type === "tool-input-delta" ||
            chunk.type.startsWith("reasoning")
          )
            continue;
          if (
            chunk.type === "tool-input-available" ||
            chunk.type === "tool-input-error" ||
            chunk.type === "tool-output-available" ||
            chunk.type === "tool-output-error"
          ) {
            const safe = redact(chunk);
            await screen(JSON.stringify(safe));
            if (!cancelled) controller.enqueue(safe);
            continue;
          }
          if (chunk.type === "finish") status("");
          controller.enqueue(chunk);
        }
        if (interrupted && !cancelled) {
          if (segmentStarted)
            controller.enqueue({ type: "text-end", id: textId });
          status("");
          controller.enqueue({ type: "error", errorText: interruptionMessage });
        }
      } catch (error) {
        if (!cancelled) {
          if (segmentStarted)
            controller.enqueue({ type: "text-end", id: textId });
          status("");
          controller.enqueue({
            type: "error",
            errorText:
              trustedStreamError(
                error instanceof Error ? error.message : undefined,
              ) || "This request could not finish. Please try again.",
          });
        }
      } finally {
        clearInterval(timer);
        await reader.cancel().catch(() => {});
        reader.releaseLock();
        if (!cancelled) controller.close();
      }
    },
    cancel() {
      cancelled = true;
      return reader?.cancel();
    },
  });
}
