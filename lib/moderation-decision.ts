import { z } from "zod";
import { isTeacherApprovedPrompt, maskBlockedPrompts } from "./blocked-prompts";
export const moderationDecisionSchema = z.object({
  decision: z.enum(["allow", "block", "review"]),
  categories: z.array(
    z.enum([
      "bullying",
      "hate",
      "self_harm",
      "violence",
      "sexual_minors",
      "prompt_manipulation",
      "malicious_code",
      "privacy",
    ]),
  ),
  severity: z.enum(["low", "medium", "high", "critical"]),
  score: z.number().min(0).max(1),
});
export function parseModerationDecision(content: unknown) {
  if (typeof content !== "string") throw Error("Missing moderation decision");
  // Some providers wrap otherwise valid JSON. Never extract a decision from prose.
  const json = content
    .trim()
    .replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, "$1");
  return moderationDecisionSchema.parse(JSON.parse(json));
}
/** Keep earlier intent during input checks. Final output checks screen the model's
 * answer without reclassifying the exact student request a teacher already approved.
 * Unapproved requests, assistant answers and streamed tool checks remain screened. */
export function moderationConversation(
  messages: Array<{
    role: string;
    parts?: Array<{ type: string; text?: string }>;
    metadata?: unknown;
  }>,
  phase: "input" | "output" = "input",
) {
  return JSON.stringify(
    maskBlockedPrompts(messages)
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role,
        content:
          phase === "output" && isTeacherApprovedPrompt(m)
            ? "[Student request reviewed and approved by a classroom teacher]"
            : (m.parts || [])
                .filter((p) => p.type === "text" && typeof p.text === "string")
                .map((p) => p.text)
                .join("\n"),
      }))
      .filter((m) => m.content),
  );
}
