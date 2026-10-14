export type PaymentMode = "sandbox" | "live";
export const paymentMode = (): PaymentMode =>
  process.env.DREAMFORGE_PAYMENT_MODE === "live" ? "live" : "sandbox";
export function paymentKeyMatchesMode(
  key = process.env.STRIPE_SECRET_KEY || "",
  mode = paymentMode(),
) {
  return key.startsWith(mode === "sandbox" ? "sk_test_" : "sk_live_");
}
export function paymentEventMatchesMode(
  event: { livemode?: unknown; data?: { object?: { livemode?: unknown } } },
  mode = paymentMode(),
) {
  const live = mode === "live";
  return event.livemode === live && event.data?.object?.livemode === live;
}
