import { paymentEventMatchesMode } from "@/lib/payment-mode";
import { database } from "@/lib/database";
import { verifiedStripeBody } from "@/lib/stripe-signature";
import { TOPUP_PACKAGES, paymentsEnabled } from "@/lib/topup-packages";
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
  const session = event.data?.object,
    pack = TOPUP_PACKAGES.find((p) => p.id === session?.metadata?.package);
  if (
    session?.payment_status !== "paid" ||
    session?.mode !== "payment" ||
    session?.currency !== "sgd" ||
    !pack ||
    session.amount_total !== pack.amount ||
    typeof session.metadata?.child_id !== "string"
  )
    return Response.json({ ok: true });
  const db = await database().connect();
  try {
    await db.query("begin");
    const { rows } = await db.query(
      "insert into adorable.payments(stripe_session_id,child_id,amount_sgd_cents,tokens) values($1,$2,$3,$4) on conflict do nothing returning child_id",
      [session.id, session.metadata.child_id, pack.amount, pack.tokens],
    );
    if (rows[0]) {
      const result = await db.query(
        "update adorable.token_accounts set token_limit=token_limit+$2 where child_id=$1",
        [rows[0].child_id, pack.tokens],
      );
      if (!result.rowCount) throw Error("Missing token account");
    }
    await db.query("commit");
    return Response.json({ ok: true });
  } catch {
    await db.query("rollback");
    return Response.json(
      { error: "Credit not recorded; retry event." },
      { status: 500 },
    );
  } finally {
    db.release();
  }
}
