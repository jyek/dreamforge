import { cookies } from "next/headers";
import { cache } from "react";
import {
  SESSION_COOKIE,
  REFRESH_COOKIE,
  SESSION_WEEK,
  cookieOptions,
  sealSession,
} from "./session-cookie";
export { SESSION_COOKIE } from "./session-cookie";
export const supabaseUrl = () => process.env.SUPABASE_URL!;
export const supabaseKey = () => process.env.SUPABASE_PUBLISHABLE_KEY!;
export const getStudentSession = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const response = await fetch(`${supabaseUrl()}/auth/v1/user`, {
      headers: { apikey: supabaseKey(), Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const user = await response.json();
    return typeof user.id === "string" ? { id: user.id as string } : null;
  } catch {
    return null;
  }
});

export async function saveLoginSession(session: {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
}) {
  if (!session.refresh_token) throw Error("Missing refresh token");
  const jar = await cookies();
  jar.set(SESSION_COOKIE, session.access_token, {
    ...cookieOptions,
    maxAge: Math.min(session.expires_in || 3600, 3600),
  });
  jar.set(
    REFRESH_COOKIE,
    sealSession({
      token: session.refresh_token,
      expires: Date.now() + SESSION_WEEK * 1000,
    }),
    { ...cookieOptions, maxAge: SESSION_WEEK },
  );
}
export async function clearLoginSession() {
  const jar = await cookies(),
    access = jar.get(SESSION_COOKIE)?.value;
  if (access)
    await fetch(`${supabaseUrl()}/auth/v1/logout?scope=local`, {
      method: "POST",
      headers: { apikey: supabaseKey(), Authorization: `Bearer ${access}` },
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});
  jar.delete(SESSION_COOKIE);
  jar.delete(REFRESH_COOKIE);
}
