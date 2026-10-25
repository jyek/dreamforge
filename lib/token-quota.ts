import { CLASSROOM_TOKEN_LIMIT_MESSAGE } from "./trusted-errors";
import { randomUUID } from "node:crypto";
import { database } from "./database";
export class QuotaError extends Error {}
export async function reserveTokens(
  userId: string,
  projectId: string,
  amount: number,
  limit: number,
  model: string,
) {
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new QuotaError("Invalid token reservation");
  const db = await database().connect();
  const id = randomUUID();
  try {
    await db.query("begin");
    await db.query(
      `insert into token_budgets(user_id,day,token_limit) values($1,(now() at time zone 'UTC')::date,$2)
      on conflict(user_id,day) do nothing`,
      [userId, limit],
    );
    const { rows } = await db.query(
      `update token_budgets set reserved_tokens=reserved_tokens+$2
      where user_id=$1 and day=(now() at time zone 'UTC')::date and used_tokens+reserved_tokens+$2<=token_limit returning day`,
      [userId, amount],
    );
    if (!rows[0]) throw new QuotaError(CLASSROOM_TOKEN_LIMIT_MESSAGE);
    await db.query(
      "insert into token_runs(id,user_id,project_id,day,reserved_tokens,model) values($1,$2,$3,$4,$5,$6)",
      [id, userId, projectId, rows[0].day, amount, model],
    );
    await db.query("commit");
    return id;
  } catch (e) {
    await db.query("rollback");
    throw e;
  } finally {
    db.release();
  }
}
export async function settleTokens(
  id: string,
  input: number,
  output: number,
  failed = false,
) {
  const db = await database().connect();
  try {
    await db.query("begin");
    const { rows } = await db.query(
      "select * from token_runs where id=$1 for update",
      [id],
    );
    const run = rows[0];
    if (!run || run.state !== "reserved") {
      await db.query("rollback");
      return;
    }
    // Missing usage stays charged at its full reservation; never silently refund an interrupted billable call.
    const total = failed ? Number(run.reserved_tokens) : input + output;
    await db.query(
      "update token_budgets set reserved_tokens=reserved_tokens-$3,used_tokens=used_tokens+$4 where user_id=$1 and day=$2",
      [run.user_id, run.day, run.reserved_tokens, total],
    );
    await db.query(
      "update token_runs set state=$2,input_tokens=$3,output_tokens=$4,settled_at=now() where id=$1",
      [
        id,
        failed ? "failed" : "settled",
        failed ? null : input,
        failed ? null : output,
      ],
    );
    await db.query("commit");
  } catch (e) {
    await db.query("rollback");
    throw e;
  } finally {
    db.release();
  }
}
