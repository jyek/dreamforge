import type { ModelMessage } from "ai";

/** Older runs recorded empty text between tool steps. Keep tool calls and
 * results, but don't send empty assistant turns to strict model providers. */
export function normalizeModelHistory(
  messages: ModelMessage[],
): ModelMessage[] {
  const normalized: ModelMessage[] = [];
  for (const message of messages) {
    if (message.role !== "assistant") {
      normalized.push(message);
      continue;
    }
    if (typeof message.content === "string") {
      if (message.content.trim()) normalized.push(message);
      continue;
    }
    const content = message.content.filter(
      (part) => part.type !== "text" || part.text.trim().length > 0,
    );
    if (content.length) normalized.push({ ...message, content });
  }
  return normalized;
}

/** Past tool payloads describe obsolete files. Retain conversational intent and
 * all tool calls/results from the current turn; reread files when needed. */
export function compactPastToolHistory(
  messages: ModelMessage[],
): ModelMessage[] {
  const boundary = messages.findLastIndex((message) => message.role === "user");
  if (boundary < 0) return messages;
  return messages.flatMap((message, index): ModelMessage[] => {
    if (index >= boundary) return [message];
    if (message.role === "tool") return [];
    if (message.role !== "assistant" || typeof message.content === "string")
      return [message];
    const content = message.content.filter(
      (part) => part.type === "text" && part.text.trim(),
    );
    return content.length ? [{ ...message, content }] : [];
  });
}
