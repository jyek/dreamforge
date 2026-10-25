import { safetyEnabled, moderationConfigured } from "./safety-mode";
import { SafetyError } from "./kids-safety";
import { demoChatInput, ChatInputError } from "./chat-input";
import type { UIMessage } from "ai";

/** Server-owned; no request field or login method can relax these capabilities. */
export function childPolicy() {
  const enabled = safetyEnabled();
  return {
    enabled,
    images: true,
    shell: true,
    repositoryImport: true,
    providerReady: process.env.STUDENT_AI_PROVIDER_APPROVED === "true",
    moderationReady: moderationConfigured(),
    sharing: enabled ? "teacher-fixed-revision" : "preview",
  } as const;
}
export function assertChildGeneration(identity: boolean, parts: unknown) {
  const policy = childPolicy();
  if (!policy.enabled) return;
  if (!identity)
    throw new SafetyError(
      "Sign in to a funded learning account before using AI.",
    );
  if (!policy.providerReady)
    throw new SafetyError(
      "Student AI is paused until your school approves the provider and its data retention terms.",
    );
  if (!policy.moderationReady)
    throw new SafetyError(
      "Safety checks are not configured. Please contact DreamForge support.",
    );
  try {
    demoChatInput(
      { id: "input", role: "user", parts: parts as UIMessage["parts"] },
      "glm",
    );
  } catch (error) {
    if (!(error instanceof ChatInputError)) throw error;
    throw new SafetyError(error.message);
  }
}
