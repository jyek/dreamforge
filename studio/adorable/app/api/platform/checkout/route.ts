import { database } from "@/lib/database";
import { checkOrigin, tokenHash } from "@/lib/platform-auth";
import { paymentsEnabled, TOPUP_PACKAGES } from "@/lib/topup-packages";
export async function POST(req: Request) {
  if (!paymentsEnabled())
    return Response.json(
      { error: "Parent payments are being set up. No charge has been made." },
      { status: 503 },
    );
  if (!checkOrigin(req))
    return Response.json({ error: "Invalid request" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const pack = TOPUP_PACKAGES.find((p) => p.id === body.package);
  if (!pack || typeof body.token !== "string")
    return Response.json({ error: "Choose a package." }, { status: 400 });
  const { rows } = await database().query(
    "select child_id from adorable.topup_requests where token_hash=$1 and expires_at>now()",
    [tokenHash(body.token)],
  );
  if (!rows[0])
    return Response.json(
      { error: "This link has expired. Ask your child for a new link." },
      { status: 404 },
    );
  const site = process.env.DREAMFORGE_SITE_URL;
  if (!site)
    return Response.json(
      { error: "Payment setup incomplete." },
      { status: 503 },
    );
  const params = new URLSearchParams({
    mode: "payment",
    success_url: `${site}/pay/${body.token}?paid=1`,
    cancel_url: `${site}/pay/${body.token}`,
    "line_items[0][price_data][currency]": "sgd",
    "line_items[0][price_data][unit_amount]": String(pack.amount),
    "line_items[0][price_data][product_data][name]": `DreamForge ${pack.name} — ${pack.tokens.toLocaleString()} tokens`,
    "line_items[0][quantity]": "1",
    "metadata[child_id]": rows[0].child_id,
    "metadata[package]": pack.id,
  });
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  return response.ok
    ? Response.json({ url: result.url })
    : Response.json(
        { error: "Payment service is unavailable. Please try again." },
        { status: 503 },
      );
}
