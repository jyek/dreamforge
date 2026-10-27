import { database } from "./database";
import { paymentMode } from "./payment-mode";
import { prepaidBillingEnabled } from "./billing";
import { allPurchasePackages } from "./topup-packages";

export type CheckoutSession = {
  id?: string;
  livemode?: boolean;
  payment_status?: string;
  mode?: string;
  currency?: string;
  amount_total?: number;
  metadata?: { child_id?: string; package?: string };
};

/** Accept only a paid package from a verified Stripe API response or webhook. */
export function paidTokenPackage(session: CheckoutSession, childId?: string) {
  const pack = allPurchasePackages().find(
    (p) => p.id === session.metadata?.package,
  );
  return /^cs_(test|live)_[a-zA-Z0-9]+$/.test(session.id || "") &&
    session.livemode === (paymentMode() === "live") &&
    session.payment_status === "paid" &&
    session.mode === "payment" &&
    session.currency === "sgd" &&
    pack &&
    session.amount_total === pack.amount &&
    typeof session.metadata?.child_id === "string" &&
    (!childId || session.metadata.child_id === childId)
    ? pack
    : null;
}

/** The unique session ID makes webhook/return-page races credit exactly once. */
export async function creditCheckout(
  session: CheckoutSession,
  childId?: string,
) {
  const pack = paidTokenPackage(session, childId);
  if (!pack) return false;
  if (pack.creditPurchase && !prepaidBillingEnabled())
    throw Error("Credit wallet is not enabled; retry delivery after setup");
  const db = await database().connect();
  try {
    await db.query("begin");
    const { rows } = await db.query(
      prepaidBillingEnabled()
        ? "insert into payments(stripe_session_id,child_id,amount_sgd_cents,tokens,credit_micros) values($1,$2,$3,$4,$5) on conflict do nothing returning child_id"
        : "insert into payments(stripe_session_id,child_id,amount_sgd_cents,tokens) values($1,$2,$3,$4) on conflict do nothing returning child_id",
      [
        session.id,
        session.metadata!.child_id,
        pack.amount,
        pack.tokens,
        ...(prepaidBillingEnabled() ? [pack.creditMicros] : []),
      ],
    );
    if (rows[0]) {
      const result = await db.query(
        prepaidBillingEnabled()
          ? "update token_accounts set credit_limit_micros=credit_limit_micros+$2 where child_id=$1"
          : "update token_accounts set token_limit=token_limit+$2 where child_id=$1",
        [
          rows[0].child_id,
          prepaidBillingEnabled() ? pack.creditMicros : pack.tokens,
        ],
      );
      if (!result.rowCount) throw Error("Missing token account");
    }
    await db.query("commit");
    return true;
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    db.release();
  }
}
