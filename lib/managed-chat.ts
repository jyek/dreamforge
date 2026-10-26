import { authorizeProject } from "./project-access";
import { checkOrigin, getProfile, platformEnabled } from "./platform-auth";
import { assertChildGeneration } from "./child-policy";
import {
  beginRun,
  executionContext,
  finishRun,
  ExecutionError,
  event,
  assertRun,
} from "./execution";
import { SafetyError } from "./kids-safety";

const defaultServices = {
  authorize: async (project: string) => !!(await authorizeProject(project)),
  identity: async () => !!(platformEnabled() ? await getProfile() : null),
};
export async function managedChat(
  req: Request,
  handler: (req: Request) => Promise<Response>,
  services = defaultServices,
) {
  let run: Awaited<ReturnType<typeof beginRun>> | undefined;
  let poll: ReturnType<typeof setInterval> | undefined;
  try {
    if (!checkOrigin(req))
      throw new ExecutionError("Invalid request origin.", 403);
    const payload = await req.clone().json();
    if (
      !/^vm-[a-z0-9]+$/.test(payload.projectId) ||
      !/^[a-f0-9-]{36}$/i.test(payload.conversationId)
    )
      throw new ExecutionError("Invalid project or conversation.", 400);
    if (!(await services.authorize(payload.projectId)))
      throw new ExecutionError("Project not found.", 404);
    const identity = await services.identity();
    assertChildGeneration(!!identity, payload.messages?.at(-1)?.parts);
    run = await beginRun(
      payload.projectId,
      payload.conversationId,
      payload.revision,
      req.signal,
      undefined,
      true,
    );
    const active = run;
    poll = setInterval(() => {
      void assertRun(active).catch(() => active.controller.abort());
    }, 1000);
    return await executionContext.run(run, async () => {
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      let ended = false;
      let cancelled = false;
      const finish = async (state: "completed" | "failed" | "cancelled") => {
        if (ended) return;
        ended = true;
        clearInterval(poll);
        await finishRun(active, state);
      };
      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (value: unknown) => {
            if (!cancelled)
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(value)}\n\n`),
              );
          };
          const status = (message: string) =>
            send({ type: "data-progress", data: { message }, transient: true });
          status("Checking your request…");
          const heartbeat = setInterval(
            () => status("Preparing your response…"),
            8000,
          );
          let failed = false;
          let sawFinish = false;
          let finishReason: string | undefined;
          let outcome: string | undefined;
          let tail = "";
          const decoder = new TextDecoder();
          try {
            await assertRun(active);
            const responseTask = handler(req);
            active.pending.add(responseTask);
            let response: Response;
            try {
              response = await responseTask;
            } finally {
              active.pending.delete(responseTask);
            }
            clearInterval(heartbeat);
            if (cancelled) {
              await response.body?.cancel();
              return;
            }
            active.signal.throwIfAborted();
            if (!response.ok || !response.body) {
              const data = await response.json().catch(() => ({}));
              send({
                type: "error",
                errorText:
                  data.error ||
                  "Your request could not start. Please try again.",
              });
              sendDone();
              await finish("failed");
              return;
            }
            reader = response.body.getReader();
            await event(active, "run.streaming");
            while (true) {
              active.signal.throwIfAborted();
              const chunk = await reader.read();
              if (chunk.done || cancelled) break;
              tail += decoder.decode(chunk.value, { stream: true });
              const lines = tail.split("\n");
              tail = lines.pop() || "";
              for (const line of lines) {
                if (!line.startsWith("data: {")) continue;
                try {
                  const part = JSON.parse(line.slice(6));
                  if (part.type === "finish") {
                    sawFinish = true;
                    finishReason = part.finishReason;
                  }
                  if (part.type === "data-run-outcome")
                    outcome = part.data?.status;
                  if (part.type === "error" || part.type === "abort")
                    failed = true;
                  if (
                    (part.type === "finish" &&
                      ["length", "error", "content-filter"].includes(
                        part.finishReason,
                      )) ||
                    (part.type === "data-run-outcome" &&
                      part.data?.status === "incomplete")
                  )
                    failed = true;
                } catch {}
              }
              controller.enqueue(chunk.value);
            }
            await event(active, "generation.finished", {
              finishReason: finishReason || "unknown",
              outcome: outcome || (sawFinish ? "unknown" : "incomplete"),
              sawFinish,
            });
            failed ||= !sawFinish;
            await finish(
              active.signal.aborted
                ? "cancelled"
                : failed
                  ? "failed"
                  : "completed",
            );
          } catch (error) {
            const stopped = active.signal.aborted;
            active.controller.abort();
            status("");
            send({
              type: "error",
              errorText: stopped
                ? "This run was stopped."
                : error instanceof ExecutionError ||
                    error instanceof SafetyError
                  ? error.message
                  : "Your request could not finish. Please try again.",
            });
            sendDone();
            await finish(stopped ? "cancelled" : "failed");
          } finally {
            clearInterval(heartbeat);
            await reader?.cancel().catch(() => {});
            if (!cancelled) controller.close();
          }
          function sendDone() {
            if (!cancelled)
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          }
        },
        async cancel() {
          cancelled = true;
          active.controller.abort();
          await reader?.cancel();
          await finish("cancelled");
        },
      });
      return new Response(body, {
        headers: {
          "Content-Type": "text/event-stream",
          "x-vercel-ai-ui-message-stream": "v1",
          "Cache-Control": "no-store",
          "X-Accel-Buffering": "no",
          "x-dreamforge-run-id": active.id,
        },
      });
    });
  } catch (error) {
    clearInterval(poll);
    if (run) {
      const cancelled = run.signal.aborted;
      run.controller.abort();
      await finishRun(run, cancelled ? "cancelled" : "failed").catch(() => {});
    }
    return Response.json(
      {
        error:
          error instanceof ExecutionError || error instanceof SafetyError
            ? error.message
            : "The learning service could not start safely. Check runtime and database setup.",
      },
      {
        status:
          error instanceof ExecutionError
            ? error.status
            : error instanceof SafetyError
              ? 403
              : 503,
      },
    );
  }
}
