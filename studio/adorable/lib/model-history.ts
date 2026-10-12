import type { ModelMessage } from "ai";

/** Older runs recorded empty text between tool steps. Keep tool calls and
 * results, but don't send empty assistant turns to strict model providers. */
export function normalizeModelHistory(messages: ModelMessage[]): ModelMessage[] {
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
