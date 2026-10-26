export type TerminalInput = { data?: string; cols?: number; rows?: number };

/** Keep at most one write in flight; combine typing during network latency. */
export function terminalInputQueue(
  send: (input: TerminalInput) => Promise<void>,
  onError: (error: unknown) => void,
  batchMs = 16,
) {
  let text = "";
  let size: { cols: number; rows: number } | undefined;
  let sending = false;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = (delay = batchMs) => {
    if (closed || sending || timer !== undefined || (!text && !size)) return;
    timer = setTimeout(() => { timer = undefined; void flush(); }, delay);
  };
  const flush = async () => {
    if (closed || sending) return;
    const input: TerminalInput = { ...(text ? { data: text } : {}), ...size };
    text = "";
    size = undefined;
    sending = true;
    try {
      await send(input);
    } catch (error) {
      // A failed response can follow accepted input. Never replay commands.
      closed = true;
      text = "";
      size = undefined;
      onError(error);
    } finally {
      sending = false;
      schedule(0);
    }
  };
  return {
    write(data: string) { if (!closed) { text += data; schedule(); } },
    resize(cols: number, rows: number) { if (!closed) { size = { cols, rows }; schedule(); } },
    dispose() { closed = true; clearTimeout(timer); text = ""; size = undefined; },
  };
}
