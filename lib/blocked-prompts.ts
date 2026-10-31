import type { UIMessage } from "ai";
export const BLOCKED_PLACEHOLDER = "[Request blocked by safety checks]";
type Part = { type: string; text?: string };
type Message = {
  role: string;
  parts?: Part[];
  metadata?: unknown;
};
export const isBlockedPrompt = (message: Message) =>
  message.role === "user" &&
  (message.metadata as { custom?: { blocked?: boolean } } | undefined)?.custom
    ?.blocked === true;
/** Keeps what the student typed so they can see it, flagged as blocked. Images
 * from a blocked request are dropped rather than stored. */
export function flagBlockedPrompt(message: UIMessage): UIMessage {
  return {
    ...message,
    parts: message.parts.filter((part) => part.type === "text"),
    metadata: {
      ...(message.metadata as object | undefined),
      custom: { blocked: true },
    },
  };
}
/** Blocked wording is shown to the student but never sent back to the model or
 * the safety check, so one blocked prompt cannot block every later message. */
export function maskBlockedPrompts<T extends Message>(messages: T[]): T[] {
  return messages.map((message) =>
    isBlockedPrompt(message)
      ? { ...message, parts: [{ type: "text", text: BLOCKED_PLACEHOLDER }] }
      : message,
  );
}
