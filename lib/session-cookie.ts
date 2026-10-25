import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
export const SESSION_COOKIE = "dreamforge_access_token";
export const REFRESH_COOKIE = "dreamforge_refresh_session";
export const SESSION_WEEK = 7 * 24 * 60 * 60;
export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
};
type RefreshSession = { token: string; expires: number };
function key() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw Error("Session encryption unavailable");
  return createHash("sha256")
    .update("dreamforge-session-v1:" + secret)
    .digest();
}
export function sealSession(value: RefreshSession) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value)),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}
export function openSession(value: string): RefreshSession | null {
  try {
    const data = Buffer.from(value, "base64url"),
      cipher = createDecipheriv("aes-256-gcm", key(), data.subarray(0, 12));
    cipher.setAuthTag(data.subarray(12, 28));
    const result = JSON.parse(
      Buffer.concat([
        cipher.update(data.subarray(28)),
        cipher.final(),
      ]).toString(),
    );
    return typeof result.token === "string" &&
      Number.isFinite(result.expires) &&
      result.expires > Date.now()
      ? result
      : null;
  } catch {
    return null;
  }
}
export function accessNeedsRefresh(token?: string) {
  try {
    const { exp } = JSON.parse(
      Buffer.from(token!.split(".")[1], "base64url").toString(),
    );
    return !Number.isFinite(exp) || exp * 1000 < Date.now() + 60000;
  } catch {
    return true;
  }
}
