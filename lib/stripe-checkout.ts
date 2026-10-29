/** Stripe owns checkout creation; never redirect to an unverified response URL. */
export async function createCheckout(
  params: URLSearchParams,
  attemptKey: string,
) {
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": attemptKey,
    },
    body: params,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error("Checkout unavailable");
  const result = await response.json();
  const url = new URL(result.url);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "checkout.stripe.com" ||
    url.username ||
    url.password ||
    url.port
  )
    throw Error("Invalid checkout URL");
  return url.toString();
}
