import { database } from "./database";
import { BILLING_VERSION, reservationCreditMicros } from "./billing";
import { QuotaError } from "./quota-error";
import { CREDIT_LIMIT_MESSAGE } from "./trusted-errors";
export async function reserveCreditUsage(
  child: string,
  project: string,
  bound: number,
  model: string,
  maxOutputTokens?: number,
) {
  const micros = reservationCreditMicros(model, bound, maxOutputTokens);
  const db = await database().connect();
  try {
    await db.query("begin");
    const r = await db.query(
      "update token_accounts set credit_reserved_micros=credit_reserved_micros+$2 where child_id=$1 and credit_used_micros+credit_reserved_micros+$2<=credit_limit_micros",
      [child, micros],
    );
    if (!r.rowCount) throw new QuotaError(CREDIT_LIMIT_MESSAGE);
    const { rows } = await db.query(
      "insert into usage_runs(child_id,vm_id,reserved_tokens,credit_reserved_micros,billing_version,model) values($1,$2,$3,$4,$5,$6) returning id",
      [child, project, bound, micros, BILLING_VERSION, model],
    );
    await db.query("commit");
    return rows[0].id as string;
  } catch (e) {
    await db.query("rollback");
    throw e;
  } finally {
    db.release();
  }
}
