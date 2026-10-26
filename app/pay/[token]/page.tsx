import { paymentMode } from "@/lib/payment-mode";
import { notFound } from "next/navigation";
import { database } from "@/lib/database";
import { tokenHash, platformEnabled } from "@/lib/platform-auth";
import { paymentsEnabled } from "@/lib/topup-packages";
import { ParentTopup } from "@/components/parent-topup";
export default async function Pay({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ paid?: string; session_id?: string }>;
}) {
  if (!platformEnabled()) notFound();
  const { token } = await params;
  const { rows } = await database().query(
    "select 1 from topup_requests where token_hash=$1 and expires_at>now()",
    [tokenHash(token)],
  );
  if (!rows[0]) notFound();
  return (
    <ParentTopup
      token={token}
      enabled={paymentsEnabled()}
      paid={(await searchParams).paid === "1"}
      sessionId={(await searchParams).session_id}
      sandbox={paymentMode() === "sandbox"}
    />
  );
}
