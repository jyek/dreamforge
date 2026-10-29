import {
  prepaidBillingEnabled,
  usageCreditMicros,
  usageModelCostUSD,
} from "./billing";
import { reserveCreditUsage } from "./prepaid-usage";
import { MODELS } from "./model-catalog";
import { TOKEN_LIMIT_MESSAGE } from "./trusted-errors";
import { QuotaError } from "./quota-error";
import { database } from "./database";
// Price caps sent to OpenRouter, not a promise of exact provider billing.
export function estimatedCost(model: string, input: number, output: number) {
  const known = Object.values(MODELS).find((m) => m.id === model);
  if (known) return (input * known.input + output * known.output) / 1000000;
  const rate = model.includes(":free")
    ? [0, 0]
    : model.includes("qwen")
      ? [0.07, 0.28]
      : model.includes("glm")
        ? [0.15, 0.5]
        : [0.3, 1.2];
  return (input * rate[0] + output * rate[1]) / 1000000;
}
export async function reserveUsage(
  child: string,
  project: string,
  bound: number,
  billingModel = MODELS.glm.id as string,
  maxOutputTokens?: number,
) {
  if (prepaidBillingEnabled())
    return reserveCreditUsage(
      child,
      project,
      bound,
      billingModel,
      maxOutputTokens,
    );
  const db = await database().connect();
  try {
    await db.query("begin");
    const { rowCount } = await db.query(
      "update token_accounts set reserved_tokens=reserved_tokens+$2 where child_id=$1 and used_tokens+reserved_tokens+$2<=token_limit",
      [child, bound],
    );
    if (!rowCount) throw new QuotaError(TOKEN_LIMIT_MESSAGE);
    const { rows } = await db.query(
      "insert into usage_runs(child_id,vm_id,reserved_tokens) values($1,$2,$3) returning id",
      [child, project, bound],
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
export async function settleUsage(
  id: string,
  input?: number,
  output?: number,
  model?: string,
  cacheUsage: import("./billing").CacheUsage = {},
) {
  const db = await database().connect();
  try {
    await db.query("begin");
    const { rows } = await db.query(
      "select * from usage_runs where id=$1 and state='reserved' for update",
      [id],
    );
    const run = rows[0];
    if (!run) {
      await db.query("commit");
      return;
    }
    let uncertain = input === undefined || output === undefined;
    let creditCost: number | null = null;
    if (run.credit_reserved_micros != null && !uncertain) {
      try {
        creditCost = usageCreditMicros(
          model || run.model,
          input!,
          output!,
          run.billing_version,
          cacheUsage,
        );
      } catch {
        uncertain = true;
      }
      // Unbounded/unrecognised usage stays held for review, never overdrafts.
      if (creditCost != null && creditCost > Number(run.credit_reserved_micros))
        uncertain = true;
    }
    if (run.credit_reserved_micros != null && !uncertain) {
      await db.query(
        "update token_accounts set credit_reserved_micros=credit_reserved_micros-$2,credit_used_micros=credit_used_micros+$3 where child_id=$1",
        [run.child_id, run.credit_reserved_micros, creditCost],
      );
    }
    const tokens = uncertain ? 0 : input! + output!;
    const cost = uncertain
      ? null
      : run.credit_reserved_micros != null
        ? usageModelCostUSD(
            model || run.model,
            input!,
            output!,
            run.billing_version,
            cacheUsage,
          )
        : estimatedCost(model || "", input!, output!);
    await db.query(
      "update token_accounts set reserved_tokens=reserved_tokens-$2,used_tokens=used_tokens+$3,input_tokens=input_tokens+$4,output_tokens=output_tokens+$5,estimated_cost_usd=estimated_cost_usd+$6 where child_id=$1",
      [
        run.child_id,
        uncertain || run.credit_reserved_micros != null
          ? 0
          : run.reserved_tokens,
        tokens,
        uncertain ? 0 : input || 0,
        uncertain ? 0 : output || 0,
        cost || 0,
      ],
    );
    await db.query(
      "update usage_runs set model=$2,input_tokens=$3,output_tokens=$4,estimated_cost_usd=$5,state=$6,settled_at=now() where id=$1",
      [
        id,
        model || null,
        input ?? null,
        output ?? null,
        cost,
        uncertain ? "uncertain" : "settled",
      ],
    );
    if (run.credit_reserved_micros != null && !uncertain)
      await db.query(
        "update usage_runs set credit_cost_micros=$2,cache_read_tokens=$3,cache_write_tokens=$4 where id=$1",
        [
          id,
          creditCost,
          cacheUsage.cacheReadTokens ?? null,
          cacheUsage.cacheWriteTokens ?? null,
        ],
      );
    await db.query("commit");
    return run.credit_reserved_micros != null && !uncertain
      ? creditCost!
      : undefined;
  } catch (e) {
    await db.query("rollback");
    throw e;
  } finally {
    db.release();
  }
}

/** A terminated Vercel function cannot leave a reservation stuck forever.
 * Unknown usage remains reserved and is labelled uncertain for teacher review. */
export async function reconcileExpiredUsage() {
  const { rows } = await database().query(
    "select id from usage_runs where state='reserved' and created_at<now()-interval '15 minutes' limit 100",
  );
  for (const run of rows) await settleUsage(run.id);
  await database().query("delete from auth_attempts where expires_at<now()");
}

/** Encoded image bytes are transport data, not text tokens. Reserve a separate
 * conservative vision allowance per image plus UTF-8 text and tool overhead. */
export function usageReservationBound(
  messages: unknown,
  system: string,
  maxOutput: number,
) {
  let images = 0;
  const text = JSON.stringify(messages, (key, value) => {
    if (
      key === "image" ||
      (typeof value === "string" && value.startsWith("data:image/"))
    ) {
      images++;
      return "[image reference]";
    }
    return value;
  });
  return (
    Buffer.byteLength(text) +
    Buffer.byteLength(system) +
    16384 +
    maxOutput +
    images * 65536
  );
}
