import { NextResponse } from "next/server";
import { authorizeProject } from "@/lib/project-access";
import { subscribeToTerminal, updateTerminal } from "@/lib/terminal-bridge";
import { APP_SESSION, WORKDIR } from "@/lib/vars";
import { invalidateManualEdit, ExecutionError } from "@/lib/execution";
import { runtimeFailure } from "@/lib/runtime-readiness";
import { terminalFailureEvent } from "@/lib/terminal-stream";

/** A terminal name the browser may ask for: the dev server, or an ad-hoc shell. */
const parseSession = (raw: string | null) => {
  const slug = (raw ?? APP_SESSION).trim();
  if (!/^[a-z0-9-]{1,60}$/.test(slug) || /^\d+$/.test(slug)) return null;
  return slug;
};

/** The dev server session already exists; any other name gets a login shell. */
const commandFor = (slug: string) =>
  slug === APP_SESSION ? undefined : `cd ${WORKDIR} && exec bash -l`;

/** Stream one terminal's output to the browser as server-sent events. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  if (!(await authorizeProject(projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const slug = parseSession(new URL(req.url).searchParams.get("session"));
  if (!slug) {
    return NextResponse.json(
      { error: "Invalid session name" },
      { status: 400 },
    );
  }

  let cleanup = () => {};
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Terminal output is arbitrary bytes; base64 keeps it intact through SSE's
      // line-oriented framing.
      const send = (chunk: Uint8Array) => {
        try {
          const payload = Buffer.from(chunk).toString("base64");
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        } catch {
          // The client went away mid-write; cleanup runs on abort.
        }
      };

      let closed=false;
      let unsubscribe=()=>{};
      const fail = (error: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(terminalFailureEvent(error)));
        cleanup();
      };
      // Flush immediately, even when an idle PTY has no output to replay.
      controller.enqueue(encoder.encode(": connected\n\n"));
      const timer=setTimeout(() => cleanup(), 240_000);
      const connecting=setTimeout(() => fail(Error("Terminal connection timed out")), 12000);
      const heartbeat=setInterval(()=>{if(!closed)controller.enqueue(encoder.encode(": keepalive\n\n"));},15_000);
      cleanup=()=>{
        if(closed)return;closed=true;
        clearTimeout(timer);clearTimeout(connecting);clearInterval(heartbeat);unsubscribe();
        req.signal.removeEventListener("abort",cleanup);
        try {controller.close();}catch{}
      };
      req.signal.addEventListener("abort",cleanup,{once:true});
      if(req.signal.aborted)cleanup();
      void subscribeToTerminal(projectId,slug,commandFor(slug),send).then(subscription=>{
        clearTimeout(connecting);
        unsubscribe=subscription;
        if(closed)unsubscribe();
        else controller.enqueue(encoder.encode("event: terminal-ready\ndata: {}\n\n"));
      }).catch(fail);
    },
    cancel() { cleanup(); },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

/** Keystrokes, resizes and signals, on their way to the guest. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  if (!(await authorizeProject(projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = (await req.json().catch(() => ({}))) as {
    session?: string;
    data?: string;
    cols?: number;
    rows?: number;
    signal?: "sigint" | "sigkill";
  };

  const slug = parseSession(payload.session ?? null);
  if (!slug) {
    return NextResponse.json(
      { error: "Invalid session name" },
      { status: 400 },
    );
  }

  if (typeof payload.data === "string" || payload.signal) {
    try {
      await invalidateManualEdit(projectId);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof ExecutionError ? error.message : "Terminal input is unavailable." },
        { status: error instanceof ExecutionError ? error.status : 503 },
      );
    }
  }
  try {
    await updateTerminal(projectId, slug, payload);
  return NextResponse.json({ ok: true });
  } catch (error) {
    const failure = runtimeFailure(error);
    return NextResponse.json({ error: failure.body.error }, { status: failure.status });
  }
}
