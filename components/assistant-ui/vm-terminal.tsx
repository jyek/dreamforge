"use client";

import { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";

/** SSE carries terminal bytes base64-encoded, since the framing is line-based. */
const decodeChunk = (payload: string) =>
  Uint8Array.from(atob(payload), (character) => character.charCodeAt(0));

/**
 * A live terminal on a project's VM.
 *
 * Output arrives over SSE and input goes back over POST, because the VM's own
 * terminal WebSocket authenticates with a header that a browser cannot set on
 * a handshake. The session is named, so it survives remounts, reloads and
 * navigation: reconnecting reattaches to the same shell and replays what it
 * has already printed.
 */
export function VmTerminal({
  projectId,
  session,
  className,
  style,
}: {
  projectId: string;
  session: string;
  className?: string;
  /** Hidden tabs stay mounted so their session keeps streaming. */
  style?: React.CSSProperties;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    const endpoint = `/api/projects/${projectId}/terminal`;
    const cleanups: Array<() => void> = [];

    let reconnect=()=>{};
    let reportError = (_message: string) => {};
    let pending=Promise.resolve();
    const post=(body:Record<string,unknown>)=>{
      pending=pending.then(async()=>{
        if(disposed)return;
        try {
          const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({session,...body}),keepalive:true});
          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            reportError(data.error || "Terminal input could not reach the workspace.");
          }
        }catch{reportError("Terminal input could not reach the workspace.");}
      });
      return pending;
    };

    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);
      if (disposed) return;

      const terminal = new Terminal({
        fontSize: 12,
        fontFamily:
          'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
        cursorBlink: true,
        disableStdin: true,
        convertEol: true,
        theme: { background: "#ffffff", foreground: "#334155" },
      });

      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(container);
      cleanups.push(() => terminal.dispose());
      reportError = (message) => {
        if (!disposed) terminal.writeln(`\r\n${message.replace(/[\x00-\x1f\x7f]/g, " ")}\r\n`);
      };

      // Keep the guest's window size in step with the element's.
      let terminalConnected = false;
      let resizeTimer: number | undefined;
      const syncSize = () => {
        fitAddon.fit();
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(
          () => {
            if (terminalConnected) void post({ cols: terminal.cols, rows: terminal.rows });
          },
          150,
        );
      };

      syncSize();

      const observer = new ResizeObserver(syncSize);
      observer.observe(container);
      cleanups.push(() => {
        observer.disconnect();
        window.clearTimeout(resizeTimer);
      });

      let input="";
      let inputTimer: ReturnType<typeof setTimeout> | undefined;
      terminal.onData((data)=>{
        input+=data;clearTimeout(inputTimer);
        inputTimer=setTimeout(()=>{const data=input;input="";void post({data});},80);
      });
      cleanups.push(()=>clearTimeout(inputTimer));

      let events:EventSource|undefined;
      reconnect=()=>{
        events?.close();
        events=new EventSource(`${endpoint}?session=${encodeURIComponent(session)}`);
        // Every connection replays guest scrollback, including automatic
        // reconnects before the Vercel function deadline.
        events.onopen=()=>{terminalConnected=false;terminal.options.disableStdin=true;terminal.reset();terminal.writeln("Connecting to workspace terminal…");};
        events.onmessage=(event)=>terminal.write(decodeChunk(event.data));
        events.addEventListener("terminal-ready", () => {
          terminalConnected = true;
          terminal.options.disableStdin = false;
          syncSize();
          if (!disposed) terminal.writeln("\r\nConnected to workspace terminal.");
        });
        events.addEventListener("terminal-error", (event) => {
          terminalConnected = false;
          terminal.options.disableStdin = true;
          events?.close();
          try { reportError(JSON.parse((event as MessageEvent).data).error); }
          catch { reportError("Could not connect to the workspace terminal."); }
        });
        events.onerror=()=>{terminalConnected=false;terminal.options.disableStdin=true;reportError("Terminal connection lost. Reconnecting…");};
      };
      reconnect();
      cleanups.push(()=>events?.close());
    })();

    return () => {
      disposed = true;
      for (const cleanup of cleanups.reverse()) cleanup();
    };
  }, [projectId, session]);

  return <div ref={containerRef} className={className} style={style} />;
}
