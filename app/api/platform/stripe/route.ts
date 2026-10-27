import { paymentEventMatchesMode } from "@/lib/payment-mode";
import { verifiedStripeBody } from "@/lib/stripe-signature";
import { paymentsEnabled } from "@/lib/topup-packages";
import { creditCheckout } from "@/lib/payment-credit";
export async function POST(req: Request) {
  if (!paymentsEnabled())
    return Response.json({ error: "Payments disabled" }, { status: 503 });
  const raw = await req.text();
  if (
    !verifiedStripeBody(
      raw,
      req.headers.get("stripe-signature") || "",
      process.env.STRIPE_WEBHOOK_SECRET!,
    )
  )
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid event" }, { status: 400 });
  }
  if (
    ![
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
    ].includes(event.type)
  )
    return Response.json({ ok: true });
  if (!paymentEventMatchesMode(event))
    return Response.json({ error: "Incorrect payment mode" }, { status: 400 });
  try {
    if (event.data?.object) await creditCheckout(event.data.object);
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Credit not recorded; retry event." },
      { status: 500 },
    );
  }
}
