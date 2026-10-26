import { database } from "@/lib/database";
import {
  checkOrigin,
  getProfile,
  inviteToken,
  platformEnabled,
  tokenHash,
} from "@/lib/platform-auth";
export async function POST(req: Request) {
  const user = platformEnabled() ? await getProfile() : null;
  if (user?.role !== "child" || !checkOrigin(req))
    return Response.json({ error: "Child account required." }, { status: 403 });
  const token = inviteToken();
  await database().query(
    "insert into topup_requests(token_hash,child_id) values($1,$2)",
    [tokenHash(token), user.id],
  );
  return Response.json({
    link: `${process.env.DREAMFORGE_SITE_URL || new URL(req.url).origin}/pay/${token}`,
  });
}
