import { cookies } from "next/headers";
import { cache } from "react";
export const SESSION_COOKIE = "dreamforge_access_token";
export const supabaseUrl = () => process.env.SUPABASE_URL!;
export const supabaseKey = () => process.env.SUPABASE_PUBLISHABLE_KEY!;
export const getStudentSession = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const response = await fetch(`${supabaseUrl()}/auth/v1/user`, { headers: { apikey: supabaseKey(), Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!response.ok) return null;
    const user = await response.json();
    return typeof user.id === "string" ? { id: user.id as string } : null;
  } catch { return null; }
});
