import type { PtySession } from "./project-runtime";
import { prepareProjectRuntime } from "./prepare-project-runtime";
import { devVm } from "./project-vm";

/**
 * A VM's terminal WebSocket authenticates with a header, and browsers cannot
 * set headers on a WebSocket handshake — so the browser cannot talk to a VM
 * directly. This module is the bridge: one server-held PTY connection per
 * named session, fanned out to browser tabs over SSE, with input posted back.
 *
 * The PTY session itself lives in the guest and outlives every connection
 * here, so losing a bridge entry costs nothing: reconnecting reattaches to the
 * same shell and replays its scrollback.
 */
type BridgedSession = {
  session: PtySession;
  subscribers: Set<(chunk: Uint8Array) => void>;
  /** Recent output, replayed to each new tab. See {@link REPLAY_LIMIT}. */
  history: Uint8Array[];
  historyBytes: number;
};

/**
 * How much output a reconnecting tab gets back. The guest replays a session's
 * scrollback only to the connection that attaches, and this bridge attaches
 * once for many tabs — so the bridge keeps its own tail to hand out. Enough
 * for a dev server's recent compile output, bounded so an app that logs in a
 * loop cannot grow it without limit.
 */
const REPLAY_LIMIT = 256 * 1024;

const registry: Map<string, Promise<BridgedSession>> = ((
  globalThis as Record<string, unknown>
)["__dreamforgeTerminals"] as Map<string, Promise<BridgedSession>>) ??
((globalThis as Record<string, unknown>)["__dreamforgeTerminals"] = new Map());

const key = (vmId: string, slug: string) => `${vmId}:${slug}`;

/**
 * Get the bridge for one named session, connecting if this is the first
 * subscriber. Reconnecting attaches to the same guest shell and replays its
 * scrollback, so a reload does not lose what the dev server has printed.
 */
const bridge = (vmId: string, slug: string, command?: string) => {
  const id = key(vmId, slug);
  const existing = registry.get(id);
  if (existing) return existing;

  const opening = (async (): Promise<BridgedSession> => {
    await prepareProjectRuntime(vmId);
    const subscribers = new Set<(chunk: Uint8Array) => void>();

    const history: Uint8Array[] = [];
    let historyBytes = 0;

    const events = {
      onData: (chunk: Uint8Array) => {
        history.push(chunk);
        historyBytes += chunk.byteLength;
        while (historyBytes > REPLAY_LIMIT && history.length > 1) {
          historyBytes -= history.shift()!.byteLength;
        }
        for (const subscriber of subscribers) subscriber(chunk);
      },
      onClose: () => registry.delete(id),
      onError: () => registry.delete(id),
    };

    // Attach first: only attaching replays a session's retained scrollback,
    // which is what puts the dev server's existing output into a freshly
    // opened tab. `open` is the fallback for a name with no session yet.
    const pty = devVm(vmId).pty;
    const session = await pty.attach({ session: slug, ...events }).catch(() =>
      pty.open({
        slug,
        ...(command ? { exec: command } : {}),

        cols: 120,
        rows: 30,
        ...events,
      }),
    );

    return {
      session,
      subscribers,
      get history() {
        return history;
      },
      get historyBytes() {
        return historyBytes;
      },
    };
  })();

  registry.set(id, opening);
  opening.catch(() => registry.delete(id));
  return opening;
};

/** Stream a session's output to one browser tab, recent history first. */
export const subscribeToTerminal = async (
  vmId: string,
  slug: string,
  command: string | undefined,
  onChunk: (chunk: Uint8Array) => void,
) => {
  if (process.env.VERCEL) {
    // A stream owns its connection; process-local registries can retain frozen
    // opening promises between serverless invocations.
    const pty = devVm(vmId).pty;
    const session = await pty
      .attach({ session: slug, onData: onChunk })
      .catch(() =>
        pty.open({
          slug,
          ...(command ? { exec: command } : {}),
          cols: 120,
          rows: 30,
          onData: onChunk,
        }),
      );
    return () => session.detach();
  }
  const connection = await bridge(vmId, slug, command);

  for (const chunk of connection.history) onChunk(chunk);

  connection.subscribers.add(onChunk);
  return () => {
    connection.subscribers.delete(onChunk);
    if (!connection.subscribers.size) {
      connection.session.detach();
      registry.delete(key(vmId, slug));
    }
  };
};

async function withInputSession(
  vmId: string,
  slug: string,
  action: (session: PtySession) => void | Promise<void>,
) {
  if (!process.env.VERCEL) {
    await action((await bridge(vmId, slug)).session);
    return;
  }
  // Acknowledged HTTP process input leaves the SSE output socket attached.
  await action(await devVm(vmId).pty.input(slug));
}

export const writeToTerminal = (vmId: string, slug: string, data: string) =>
  withInputSession(vmId, slug, (session) => session.write(data));
export const resizeTerminal = (
  vmId: string,
  slug: string,
  cols: number,
  rows: number,
) => withInputSession(vmId, slug, (session) => session.resize({ cols, rows }));
export const signalTerminal = (
  vmId: string,
  slug: string,
  signal: "sigint" | "sigkill",
) => withInputSession(vmId, slug, (session) => session.signal(signal));
