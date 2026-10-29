import { localDevelopmentBilling } from "@/lib/local-development";
import { database } from "@/lib/database";
import { checkOrigin, tokenHash } from "@/lib/platform-auth";
import { paymentsEnabled, purchasePackages } from "@/lib/topup-packages";
import { createCheckout } from "@/lib/stripe-checkout";
import { randomUUID } from "node:crypto";
export async function POST(req: Request) {
  if (!paymentsEnabled())
    return Response.json(
      { error: "Parent payments are being set up. No charge has been made." },
      { status: 503 },
    );
  if (!checkOrigin(req))
    return Response.json({ error: "Invalid request" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (!body || typeof body !== "object")
    return Response.json({ error: "Choose a package." }, { status: 400 });
  const pack = purchasePackages().find((p) => p.id === body.package);
  if (!pack || typeof body.token !== "string")
    return Response.json({ error: "Choose a package." }, { status: 400 });
  if (
    body.attemptId !== undefined &&
    (typeof body.attemptId !== "string" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        body.attemptId,
      ))
  )
    return Response.json(
      { error: "Invalid checkout attempt." },
      { status: 400 },
    );
  const { rows } = await database().query(
    "select child_id from topup_requests where token_hash=$1 and expires_at>now()",
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
    "payment_method_types[0]": "card",
    success_url: `${site}/pay/${body.token}?paid=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${site}/pay/${body.token}`,
    "line_items[0][price_data][currency]": "sgd",
    "line_items[0][price_data][unit_amount]": String(pack.amount),
    "line_items[0][price_data][product_data][name]": `DreamForge ${pack.name}`,
    "line_items[0][quantity]": "1",
    ...(localDevelopmentBilling()
      ? {
          "metadata[local_child_id]": rows[0].child_id,
          "metadata[local_origin]": site,
        }
      : { "metadata[child_id]": rows[0].child_id }),
    "metadata[package]": pack.id,
  });
  // A browser retry reuses its attempt ID. Different purchases get new IDs.
  const key = tokenHash(
    `${body.token}:${pack.id}:${body.attemptId || randomUUID()}`,
  );
  try {
    return Response.json({ url: await createCheckout(params, key) });
  } catch {
    return Response.json(
      { error: "Payment service is unavailable. Please try again." },
      { status: 503 },
    );
  }
}
