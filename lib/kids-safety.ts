import { MODERATION_RETRY_MESSAGE } from "./trusted-errors";
import { builtinModeration } from "./builtin-moderation";
import { moderationConfigured } from "./safety-mode";
import { safetyEnabled } from "./safety-mode";
import { createHash } from "node:crypto";
import { moderationDecisionSchema as resultSchema } from "./moderation-decision";
import type { z } from "zod";
import { QuotaError } from "./token-quota";
import { localSafetyDecision } from "./local-safety-policy";
import { database } from "./database";
export const POLICY_VERSION = "dreamforge-safety-2026-10-10-v1";
export class SafetyError extends Error {
  constructor(
    message: string,
    readonly kind:
      | "blocked"
      | "unavailable"
      | "configuration"
      | "quota" = "blocked",
  ) {
    super(message);
  }
  get preservesPrompt() {
    return this.kind !== "blocked";
  }
}
export function redactIdentity(text: string, aliases: string[] = []): string {
  let safe = text
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[private email]")
    .replace(/\b(?:sk-or-v1-|sk-|sb_secret_)[A-Za-z0-9_-]+/g, "[private key]")
    .replace(/(?:\+?\d[\d ()-]{7,}\d)/g, "[private phone]");
  for (const alias of aliases
    .filter((x) => x.length >= 2)
    .sort((a, b) => b.length - a.length))
    safe = safe.replace(
      new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"),
      "[student]",
    );
  return safe;
}
export function codeRisk(text: string) {
  return /\b(?:child_process|node:fs|execSync|process\.env|document\.cookie|localStorage|sessionStorage)\b|\b(?:require|eval|fetch|XMLHttpRequest|WebSocket)\s*\(|\bnew\s+Function\b|https?:\/\/|\bon(?:load|error)\s*=|<script\b|javascript:/i.test(
    text,
  );
}
export async function screenContent(
  projectId: string,
  userId: string | null,
  phase: "input" | "output" | "tool",
  text: string,
) {
  const url = process.env.STUDENT_MODERATION_URL;
  if ((userId || safetyEnabled()) && !moderationConfigured())
    throw new SafetyError(
      "Safety checks are not configured. Please contact DreamForge support.",
      "configuration",
    );
  let result: z.infer<typeof resultSchema>;
  if (!userId && !safetyEnabled()) {
    result = localSafetyDecision(text) as z.infer<typeof resultSchema>;
  } else {
    try {
      if (process.env.STUDENT_MODERATION_PROVIDER === "openrouter" && !url) {
        result = resultSchema.parse(
          await builtinModeration(text, phase, projectId, userId),
        );
      } else {
        const response = await fetch(url!, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.STUDENT_MODERATION_KEY}`,
          },
          body: JSON.stringify({
            text,
            phase,
            ageBand: "under_13",
            level: "strict",
            policyVersion: POLICY_VERSION,
          }),
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw Error("moderation unavailable");
        result = resultSchema.parse(await response.json());
      }
    } catch (error) {
      if (error instanceof QuotaError)
        throw new SafetyError(error.message, "quota");
      // Log metadata only: never prompts, source, provider bodies or credentials.
      console.error("moderation.failed", {
        phase,
        errorType: error instanceof Error ? error.name : "Unknown",
        status:
          typeof (error as { status?: unknown })?.status === "number"
            ? (error as { status: number }).status
            : undefined,
      });
      throw new SafetyError(MODERATION_RETRY_MESSAGE, "unavailable");
    }
  }
  // A model label cannot override a prohibited category, or relax under-13 rules.
  if (result.categories.length && result.decision === "allow")
    result.decision = "review";
  if (
    ["high", "critical"].includes(result.severity) ||
    result.categories.includes("sexual_minors")
  )
    result.decision = "block";
  const hash = createHash("sha256").update(text).digest("hex");
  const event = !userId
    ? await database().query(
        `insert into adorable.safety_events(vm_id,phase,decision,categories,severity,content_hash,content,policy_version)
    values($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
        [
          projectId,
          phase,
          result.decision,
          result.categories,
          result.severity,
          hash,
          text,
          POLICY_VERSION + (safetyEnabled() ? "-semantic" : "-local-rules"),
        ],
      )
    : await database().query(
        `insert into harness_safety_events(project_id,user_id,phase,decision,categories,severity,content_hash,content,policy_version)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
        [
          projectId,
          userId,
          phase,
          result.decision,
          result.categories,
          result.severity,
          hash,
          text,
          POLICY_VERSION,
        ],
      );
  const rows = event.rows;
  if (userId && result.decision === "review" && phase === "input") {
    const approved = await database().query(
      `select 1 from harness_safety_events where project_id=$1 and user_id=$2 and content_hash=$3 and phase='input' and decision='review' and review_status='allowed' and policy_version=$4 and reviewed_at>now()-interval '24 hours' limit 1`,
      [projectId, userId, hash, POLICY_VERSION],
    );
    if (approved.rowCount) return;
  }
  if (result.decision !== "allow")
    throw new SafetyError(
      result.categories.includes("self_harm")
        ? "You deserve support. Please talk to someone you trust about how you are feeling."
        : result.decision === "review"
          ? "I couldn’t confirm this request is safe. Try describing what you want to build more clearly."
          : "I can’t help with that request. Try a different game, app, or coding idea.",
    );
  return rows[0].id;
}
