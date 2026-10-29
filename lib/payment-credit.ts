import { localDevelopmentBilling } from "./local-development";
import { database } from "./database";
import { paymentMode } from "./payment-mode";
import { allPurchasePackages } from "./topup-packages";

export type CheckoutSession = {
  id?: string;
  livemode?: boolean;
  payment_status?: string;
  mode?: string;
  currency?: string;
  amount_total?: number;
  metadata?: {
    child_id?: string;
    package?: string;
    local_child_id?: string;
    local_origin?: string;
  };
};

export function paymentChildId(session: CheckoutSession) {
  if (!localDevelopmentBilling()) return session.metadata?.child_id;
  return session.metadata?.local_origin === process.env.DREAMFORGE_SITE_URL
    ? session.metadata?.local_child_id
    : undefined;
}
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
    typeof paymentChildId(session) === "string" &&
    (!childId || paymentChildId(session) === childId)
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
  const db = await database().connect();
  try {
    await db.query("begin");
    const { rows } = await db.query(
      "insert into payments(stripe_session_id,child_id,amount_sgd_cents,tokens,credit_micros) values($1,$2,$3,$4,$5) on conflict do nothing returning child_id",
      [
        session.id,
        paymentChildId(session),
        pack.amount,
        pack.tokens,
        pack.creditMicros,
      ],
    );
    if (rows[0]) {
      const result = await db.query(
        "update token_accounts set credit_limit_micros=credit_limit_micros+$2 where child_id=$1",
        [rows[0].child_id, pack.creditMicros],
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
