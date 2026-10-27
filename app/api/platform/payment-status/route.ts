import { prepaidBillingEnabled, availableCreditMicros } from "@/lib/billing";
import { database } from "@/lib/database";
import { checkOrigin, tokenHash } from "@/lib/platform-auth";
import { creditCheckout, type CheckoutSession } from "@/lib/payment-credit";
import { paymentsEnabled } from "@/lib/topup-packages";

const headers = { "Cache-Control": "private, no-store" };
async function status(token: unknown, session: unknown, reconcile: boolean) {
  if (
    typeof token !== "string" ||
    !token ||
    token.length > 128 ||
    typeof session !== "string" ||
    !/^cs_(test|live)_[a-zA-Z0-9]+$/.test(session)
  )
    return Response.json(
      { error: "Invalid payment link." },
      { status: 400, headers },
    );
  const db = database();
  const { rows: links } = await db.query(
    "select child_id from topup_requests where token_hash=$1 and expires_at>now()",
    [tokenHash(token)],
  );
  if (!links[0])
    return Response.json(
      { error: "This top-up link has expired." },
      { status: 404, headers },
    );
  const childId = links[0].child_id;
  const readCredit = () =>
    db.query(
      `select p.tokens,${prepaidBillingEnabled() ? "p.credit_micros,a.credit_limit_micros,a.credit_used_micros,a.credit_reserved_micros," : ""}greatest(0,a.token_limit-a.used_tokens-a.reserved_tokens)::text as remaining
     from payments p join token_accounts a on a.child_id=p.child_id
     where p.child_id=$1 and p.stripe_session_id=$2`,
      [childId, session],
    );
  let { rows } = await readCredit();
  if (!rows.length && reconcile && paymentsEnabled()) {
    try {
      const response = await fetch(
        `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(session)}`,
        {
          headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!response.ok) throw Error("Stripe lookup unavailable");
      const checkout = (await response.json()) as CheckoutSession;
      if (checkout.id !== session || checkout.metadata?.child_id !== childId)
        return Response.json(
          { error: "This payment does not match this top-up link." },
          { status: 400, headers },
        );
      await creditCheckout(checkout, childId);
      ({ rows } = await readCredit());
    } catch {
      return Response.json(
        {
          error:
            "We couldn’t confirm your payment yet. Please check again. You don’t need to pay again.",
        },
        { status: 503, headers },
      );
    }
  }
  return Response.json(
    {
      credited: !!rows[0],
      tokens: Number(rows[0]?.tokens || 0),
      remaining: rows[0] ? Number(rows[0].remaining) : null,
      ...(prepaidBillingEnabled()
        ? {
            creditAddedMicros: rows[0]
              ? rows[0].credit_micros == null
                ? null
                : Number(rows[0].credit_micros)
              : null,
            availableCreditMicros: rows[0]
              ? availableCreditMicros(rows[0])
              : null,
            prepaid: true,
          }
        : {}),
    },
    { headers },
  );
}
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  return status(params.get("token"), params.get("session"), false);
}
export async function POST(req: Request) {
  if (!checkOrigin(req))
    return Response.json(
      { error: "Invalid request." },
      { status: 403, headers },
    );
  const body = await req.json().catch(() => ({}));
  return status(body.token, body.session, true);
}
