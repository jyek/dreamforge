/** Only fixed server-authored errors may bypass streamed-output screening. */
export const TOKEN_LIMIT_MESSAGE =
  "You need more tokens to finish this request. Please top up your token balance, then try again.";
export const CLASSROOM_TOKEN_LIMIT_MESSAGE =
  "Not enough tokens are available for this request. Please top up your token balance, or wait for any running request to finish, then try again.";
export const MODERATION_RETRY_MESSAGE =
  "The safety check could not finish. Please retry your message. Your request was not marked unsafe.";
export const CREDIT_LIMIT_MESSAGE =
  "Not enough prepaid credit is available for this request. Please top up your balance, choose a lower-cost model, or wait for a running request to finish.";
const trusted = new Set([
  CREDIT_LIMIT_MESSAGE,
  TOKEN_LIMIT_MESSAGE,
  CLASSROOM_TOKEN_LIMIT_MESSAGE,
  MODERATION_RETRY_MESSAGE,
]);
export function trustedStreamError(value: unknown): string | undefined {
  return typeof value === "string" && trusted.has(value) ? value : undefined;
}
