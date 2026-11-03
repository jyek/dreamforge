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
export const isHeldPrompt = (message: Message) =>
  message.role === "user" &&
  (message.metadata as { custom?: { held?: boolean } } | undefined)?.custom
    ?.held === true;
export const isTeacherApprovedPrompt = (message: Message) =>
  message.role === "user" &&
  (message.metadata as { custom?: { teacherApproved?: boolean } } | undefined)
    ?.custom?.teacherApproved === true;
/** Server only: call after consuming an exact, current classroom approval. */
export function flagTeacherApprovedPrompt(message: UIMessage): UIMessage {
  return {
    ...message,
    metadata: {
      ...(message.metadata as object | undefined),
      custom: { teacherApproved: true },
    },
  };
}
export function flagHeldPrompt(
  message: UIMessage,
  reviewId?: string,
): UIMessage {
  return {
    ...message,
    parts: message.parts.filter((part) => part.type === "text"),
    metadata: {
      ...(message.metadata as object | undefined),
      custom: { held: true, ...(reviewId ? { reviewId } : {}) },
    },
  };
}
/** Keeps what the student typed so they can see it, flagged as blocked. Images
 * from a blocked request are dropped rather than stored. */
export function flagBlockedPrompt(
  message: UIMessage,
  reviewId?: string,
): UIMessage {
  return {
    ...message,
    parts: message.parts.filter((part) => part.type === "text"),
    metadata: {
      ...(message.metadata as object | undefined),
      custom: { blocked: true, ...(reviewId ? { reviewId } : {}) },
    },
  };
}
/** Blocked wording is shown to the student but never sent back to the model or
 * the safety check, so one blocked prompt cannot block every later message. */
export function maskBlockedPrompts<T extends Message>(messages: T[]): T[] {
  return messages.map((message) =>
    isBlockedPrompt(message) || isHeldPrompt(message)
      ? { ...message, parts: [{ type: "text", text: BLOCKED_PLACEHOLDER }] }
      : message,
  );
}
/** Match older saved blocked messages to their author's server-side reviews.
 * Duplicate prompt text is paired in conversation order, never by a global lookup. */
export function attachPromptReviewIds(
  messages: UIMessage[],
  reviews: { id: string; content: string }[],
): UIMessage[] {
  const used = new Set(
    messages
      .map(
        (m) =>
          (m.metadata as { custom?: { reviewId?: string } } | undefined)?.custom
            ?.reviewId,
      )
      .filter(Boolean),
  );
  let changed = false;
  const result = messages.map((message) => {
    if (
      (!isBlockedPrompt(message) && !isHeldPrompt(message)) ||
      (message.metadata as { custom?: { reviewId?: string } } | undefined)
        ?.custom?.reviewId
    )
      return message;
    const text = message.parts
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("");
    const review = reviews.find((r) => !used.has(r.id) && r.content === text);
    if (!review) return message;
    used.add(review.id);
    changed = true;
    return {
      ...message,
      metadata: {
        ...(message.metadata as object | undefined),
        custom: {
          ...(message.metadata as { custom?: object } | undefined)?.custom,
          reviewId: review.id,
        },
      },
    };
  });
  return changed ? result : messages;
}
