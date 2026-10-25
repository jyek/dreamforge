import { database } from "@/lib/database";
import { tokenHash } from "@/lib/platform-auth";
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const token = params.get("token"),
    session = params.get("session");
  if (
    !token ||
    token.length > 128 ||
    !session ||
    !/^cs_(test|live)_[a-zA-Z0-9]+$/.test(session)
  )
    return Response.json({ error: "Invalid payment link." }, { status: 400 });
  const { rows } = await database().query(
    `select p.tokens from adorable.topup_requests t left join adorable.payments p on p.child_id=t.child_id and p.stripe_session_id=$2 where t.token_hash=$1 and t.expires_at>now()`,
    [tokenHash(token), session],
  );
  if (!rows.length)
    return Response.json(
      { error: "This top-up link has expired." },
      { status: 404 },
    );
  return Response.json(
    { credited: rows[0].tokens != null, tokens: Number(rows[0].tokens || 0) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
