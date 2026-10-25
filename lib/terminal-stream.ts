import { runtimeFailure } from "./runtime-readiness";

export function terminalFailureEvent(error: unknown) {
  const failure = runtimeFailure(error);
  const message = failure.body.state === "blocked"
    ? failure.body.error
    : "Could not connect to the workspace terminal. Reopen the terminal tab to try again.";
  return `event: terminal-error\ndata: ${JSON.stringify({ error: message })}\n\n`;
}
