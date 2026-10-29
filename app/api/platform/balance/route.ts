import { availableCreditMicros, creditWalletSelect } from "@/lib/billing";
import { database } from "@/lib/database";
import { getProfile, platformEnabled } from "@/lib/platform-auth";
export async function GET() {
  const user = platformEnabled() ? await getProfile() : null;
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (user.role !== "child")
    return Response.json(
      { error: "Builder account required." },
      { status: 403 },
    );
  const { rows } = await database().query(
    `select greatest(0,token_limit-used_tokens-reserved_tokens)::text as remaining,${creditWalletSelect()} from token_accounts where child_id=$1`,
    [user.id],
  );
  return Response.json(
    {
      remaining: Number(rows[0]?.remaining || 0),
      prepaid: true,
      availableCreditMicros: availableCreditMicros(rows[0]),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
