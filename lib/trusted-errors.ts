/** Only fixed server-authored errors may bypass streamed-output screening. */
export const MODERATION_RETRY_MESSAGE =
  "The safety check could not finish. Please retry your message. Your request was not marked unsafe.";
export const CREDIT_LIMIT_MESSAGE =
  "Not enough prepaid credit is available for this request. Please top up your balance, choose a lower-cost model, or wait for a running request to finish.";
const trusted = new Set([CREDIT_LIMIT_MESSAGE, MODERATION_RETRY_MESSAGE]);
export function trustedStreamError(value: unknown): string | undefined {
  return typeof value === "string" && trusted.has(value) ? value : undefined;
}
