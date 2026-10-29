import { CREDIT_TOPUPS } from "./billing";
import { paymentKeyMatchesMode } from "./payment-mode";
// Proposed pilot packages; live checkout also requires the explicit payment flag.
const LEGACY_TOKEN_PACKAGES = [
  { id: "spark", name: "Spark", amount: 500, tokens: 1000000 },
  { id: "builder", name: "Builder", amount: 1000, tokens: 2500000 },
  { id: "dreamer", name: "Dreamer", amount: 2000, tokens: 6000000 },
] as const;
export const paymentsEnabled = () =>
  process.env.DREAMFORGE_PAYMENTS_ENABLED === "true" &&
  paymentKeyMatchesMode() &&
  !!process.env.STRIPE_WEBHOOK_SECRET;

export const allPurchasePackages = () => [
  ...LEGACY_TOKEN_PACKAGES.map((p) => ({
    ...p,
    creditMicros: p.tokens * 5,
    creditPurchase: false,
  })),
  ...CREDIT_TOPUPS.map((p) => ({
    ...p,
    tokens: 0,
    creditMicros: p.amount * 10000,
    creditPurchase: true,
  })),
];
export const purchasePackages = () =>
  allPurchasePackages().filter((p) => p.creditPurchase);
