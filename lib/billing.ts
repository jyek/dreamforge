/** Proposed retail SGD rates, versioned independently of provider cost estimates. */
export const prepaidBillingEnabled = () =>
  process.env.DREAMFORGE_PREPAID_BILLING_ENABLED === "true";
export const BILLING_VERSION = "sgd-2026-10-v1";
export const CREDIT_TOPUPS = [
  { id: "credit-5-v1", name: "S$5 credit", amount: 500 },
  { id: "credit-10-v1", name: "S$10 credit", amount: 1000 },
  { id: "credit-20-v1", name: "S$20 credit", amount: 2000 },
  { id: "credit-40-v1", name: "S$40 credit", amount: 4000 },
] as const;
const rates: Record<
  string,
  { input: number; output: number; longInput?: number; longOutput?: number }
> = {
  "cohere/north-mini-code:free": { input: 0.25, output: 1 },
  "z-ai/glm-5.3-flash": { input: 0.75, output: 2.5 },
  "deepseek/deepseek-v4.1-flash": { input: 1.5, output: 6 },
  "anthropic/claude-sonnet-5.5": { input: 10, output: 50 },
  "openai/gpt-6.1-sol": {
    input: 10,
    output: 50,
    longInput: 20,
    longOutput: 75,
  },
  "z-ai/glm-5.3": { input: 7, output: 22 },
  "openai/gpt-oss-safeguard-20b": { input: 0.375, output: 1.5 },
};
export function billingRate(
  model: string,
  inputTokens = 0,
  version = BILLING_VERSION,
) {
  if (version !== BILLING_VERSION || !rates[model])
    throw Error("No approved price for this model");
  const r = rates[model];
  return inputTokens > 272000 && r.longInput
    ? { input: r.longInput, output: r.longOutput! }
    : r;
}
export function usageCreditMicros(
  model: string,
  input: number,
  output: number,
  version = BILLING_VERSION,
) {
  if (![input, output].every((n) => Number.isSafeInteger(n) && n >= 0))
    throw Error("Invalid token usage");
  const r = billingRate(model, input, version);
  // SGD per million tokens equals micro-SGD per token. Round once per step.
  return Math.ceil(input * r.input + output * r.output);
}
export function reservationCreditMicros(model: string, tokenBound: number, maxOutputTokens?: number) {
  if (!Number.isSafeInteger(tokenBound) || tokenBound <= 0)
    throw Error("Invalid usage bound");
  if (maxOutputTokens !== undefined) {
    if (
      !Number.isSafeInteger(maxOutputTokens) ||
      maxOutputTokens <= 0 ||
      maxOutputTokens > tokenBound
    )
      throw Error("Invalid output bound");
    const inputBound = tokenBound - maxOutputTokens;
    const r = billingRate(model, inputBound);
    return Math.ceil(inputBound * r.input + maxOutputTokens * r.output);
  }
  const r = billingRate(model, Number.MAX_SAFE_INTEGER);
  return Math.ceil(tokenBound * Math.max(r.input, r.output));
}
export type CreditWallet = {
  credit_limit_micros?: string | number;
  credit_used_micros?: string | number;
  credit_reserved_micros?: string | number;
};
export function availableCreditMicros(w: CreditWallet | null | undefined) {
  return Math.max(
    0,
    Number(w?.credit_limit_micros || 0) -
      Number(w?.credit_used_micros || 0) -
      Number(w?.credit_reserved_micros || 0),
  );
}
export const formatCredit = (micros: number) =>
  `S$${(micros / 1000000).toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
// This projection keeps the review deployment compatible with the existing DB.
export const creditWalletSelect = (prefix = "") =>
  prepaidBillingEnabled()
    ? `${prefix}credit_limit_micros,${prefix}credit_used_micros,${prefix}credit_reserved_micros`
    : "null::bigint as credit_limit_micros,null::bigint as credit_used_micros,null::bigint as credit_reserved_micros";
