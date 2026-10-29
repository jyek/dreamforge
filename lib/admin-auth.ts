import { database } from "./database";
import { getProfile, type Profile } from "./platform-auth";
export async function isPlatformAdmin(profileId?: string | null) {
  if (!profileId) return false;
  const { rowCount } = await database().query(
    "select 1 from platform_admins where profile_id=$1",
    [profileId],
  );
  return !!rowCount;
}
export const adminHeaders = { "Cache-Control": "private, no-store" };
export async function authorizeAdminRequest(
  req: Request,
  loadProfile: () => Promise<Profile | null> = getProfile,
) {
  const user = await loadProfile();
  if (!user)
    return {
      response: Response.json(
        { error: "Sign in to admin first." },
        { status: 401, headers: adminHeaders },
      ),
    };
  if (!(await isPlatformAdmin(user.id)))
    return {
      response: Response.json(
        { error: "Administrator access is required." },
        { status: 403, headers: adminHeaders },
      ),
    };
  if (!["GET", "HEAD"].includes(req.method)) {
    const origin = req.headers.get("origin");
    if (
      !origin ||
      (origin !== new URL(req.url).origin &&
        origin !== process.env.DREAMFORGE_SITE_URL)
    )
      return {
        response: Response.json(
          { error: "Invalid request origin." },
          { status: 403, headers: adminHeaders },
        ),
      };
    if (!req.headers.get("content-type")?.startsWith("application/json"))
      return {
        response: Response.json(
          { error: "Send a JSON request." },
          { status: 415, headers: adminHeaders },
        ),
      };
  }
  return { user };
}
