import { paymentKeyMatchesMode } from "./payment-mode";
// Proposed pilot packages; live checkout also requires the explicit payment flag.
export const TOPUP_PACKAGES = [
  { id: "spark", name: "Spark", amount: 500, tokens: 1000000 },
  { id: "builder", name: "Builder", amount: 1000, tokens: 2500000 },
  { id: "dreamer", name: "Dreamer", amount: 2000, tokens: 6000000 },
] as const;
export const paymentsEnabled = () =>
  process.env.DREAMFORGE_PAYMENTS_ENABLED === "true" &&
  paymentKeyMatchesMode() &&
  !!process.env.STRIPE_WEBHOOK_SECRET;
