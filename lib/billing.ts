/** Proposed retail SGD rates, versioned independently of provider cost estimates. */
export const BILLING_VERSION = "sgd-2026-10-cost-plus-50-v1";
// Explicit planning conversion, frozen with this price version; not a live FX quote.
const FX_NUMERATOR = BigInt(135),
  FX_DENOMINATOR = BigInt(100);
export const USD_TO_SGD = Number(FX_NUMERATOR) / Number(FX_DENOMINATOR);
export const MARKUP_PERCENT = 50;
export const CREDIT_TOPUPS = [
  { id: "credit-10-v1", name: "S$10 credit", amount: 1000 },
  { id: "credit-25-v1", name: "S$25 credit", amount: 2500 },
  { id: "credit-50-v1", name: "S$50 credit", amount: 5000 },
  { id: "credit-100-v1", name: "S$100 credit", amount: 10000 },
] as const;
type CostRate = {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
};
// OpenRouter catalog snapshot, 28 October 2026. USD per 1M tokens. These
// declared costs are separate from customer prices and supplier admission caps.
const costs: Record<string, CostRate> = {
  "cohere/north-mini-code:free": {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
  },
  "z-ai/glm-5.3-flash": { input: 0.15, output: 0.5, cacheRead: 0.03 },
  "deepseek/deepseek-v4.1-flash": {
    input: 0.14,
    output: 0.42,
    cacheRead: 0.0042,
  },
  "anthropic/claude-haiku-5.5": {
    input: 0.1,
    output: 0.5,
    cacheRead: 0.01,
    cacheWrite: 0.125,
  },
  "openai/gpt-6-luna": {
    input: 0.1,
    output: 0.5,
    cacheRead: 0.01,
    cacheWrite: 0.125,
  },
  "google/gemini-3.5-flash-lite": { input: 0.3, output: 2.5, cacheRead: 0.03 },
  "google/gemini-3.8-flash": { input: 0.825, output: 4.125, cacheRead: 0.0825 },
  "anthropic/claude-sonnet-5.5": {
    input: 2,
    output: 10,
    cacheRead: 0.1,
    cacheWrite: 2.5,
  },
  "openai/gpt-6.1-sol": {
    input: 2,
    output: 10,
    cacheRead: 0.1,
    cacheWrite: 2.5,
  },
  "z-ai/glm-5.3": { input: 0.0699, output: 1.4, cacheRead: 0.0689 },
  "openai/gpt-oss-safeguard-20b": {
    input: 0.075,
    output: 0.3,
    cacheRead: 0.0375,
  },
};
export function modelCostRate(
  model: string,
  inputTokens = 0,
  version = BILLING_VERSION,
): CostRate {
  if (version !== BILLING_VERSION || !costs[model])
    throw Error("No approved price for this model");
  if (model === "anthropic/claude-haiku-5.5" && inputTokens > 100000)
    return { input: 0.5, output: 2.5, cacheRead: 0.05, cacheWrite: 0.625 };
  if (model === "openai/gpt-6-luna" && inputTokens > 272000)
    return { input: 0.2, output: 0.75, cacheRead: 0.02, cacheWrite: 0.25 };
  if (model === "openai/gpt-6.1-sol" && inputTokens > 272000)
    return { input: 4, output: 15, cacheRead: 0.2, cacheWrite: 5 };
  return costs[model];
}
export function billingRate(
  model: string,
  inputTokens = 0,
  version = BILLING_VERSION,
) {
  const cost = modelCostRate(model, inputTokens, version);
  const price = (value: number) =>
    Number((value * USD_TO_SGD * (1 + MARKUP_PERCENT / 100)).toFixed(12));
  return {
    input: price(cost.input),
    output: price(cost.output),
    cacheRead: cost.cacheRead === undefined ? undefined : price(cost.cacheRead),
    cacheWrite:
      cost.cacheWrite === undefined ? undefined : price(cost.cacheWrite),
  };
}
export type CacheUsage = {
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
};
function weightedModelCost(
  model: string,
  input: number,
  output: number,
  version = BILLING_VERSION,
  cache: CacheUsage = {},
) {
  const read = cache.cacheReadTokens ?? 0,
    write = cache.cacheWriteTokens ?? 0;
  if (
    ![input, output, read, write].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    ) ||
    read + write > input
  )
    throw Error("Invalid token usage");
  const r = modelCostRate(model, input, version);
  if (
    (read > 0 && r.cacheRead === undefined) ||
    (write > 0 && r.cacheWrite === undefined)
  )
    throw Error("Unpriced cache usage");
  const units = (rate: number) => BigInt(Math.round(rate * 1000000));
  const weighted =
    BigInt(input - read - write) * units(r.input) +
    BigInt(output) * units(r.output) +
    BigInt(read) * units(r.cacheRead ?? 0) +
    BigInt(write) * units(r.cacheWrite ?? 0);
  return weighted;
}
export function usageModelCostUSD(
  model: string,
  input: number,
  output: number,
  version = BILLING_VERSION,
  cache: CacheUsage = {},
) {
  return (
    Number(weightedModelCost(model, input, output, version, cache)) /
    1000000000000
  );
}
export function usageCreditMicros(
  model: string,
  input: number,
  output: number,
  version = BILLING_VERSION,
  cache: CacheUsage = {},
) {
  const weighted = weightedModelCost(model, input, output, version, cache);
  // Integer rational arithmetic: USD rate -> SGD at 135/100 -> 150/100.
  // Round once per step to a micro-SGD, including fractions of a cent.
  const denominator = BigInt(1000000) * FX_DENOMINATOR * BigInt(100);
  const result =
    (weighted * FX_NUMERATOR * BigInt(100 + MARKUP_PERCENT) +
      denominator -
      BigInt(1)) /
    denominator;
  if (result > BigInt(Number.MAX_SAFE_INTEGER))
    throw Error("Usage exceeds billing bounds");
  return Number(result);
}
export const formatTokenRate = (sgdPerMillion: number) =>
  `S$${(sgdPerMillion / 1000000).toLocaleString("en-SG", { useGrouping: false, maximumFractionDigits: 15 })}`;
export function reservationCreditMicros(
  model: string,
  tokenBound: number,
  maxOutputTokens?: number,
) {
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
    return Math.ceil(
      inputBound * Math.max(r.input, r.cacheWrite ?? 0) +
        maxOutputTokens * r.output,
    );
  }
  const r = billingRate(model, Number.MAX_SAFE_INTEGER);
  return Math.ceil(tokenBound * Math.max(r.input, r.output, r.cacheWrite ?? 0));
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
export const formatCreditBalance = (micros: number) =>
  `S$${(micros / 1000000).toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// Dollar wallet columns are required for every deployment.
export const creditWalletSelect = (prefix = "") =>
  `${prefix}credit_limit_micros,${prefix}credit_used_micros,${prefix}credit_reserved_micros`;
