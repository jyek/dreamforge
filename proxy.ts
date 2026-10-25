import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import {
  SESSION_COOKIE,
  REFRESH_COOKIE,
  cookieOptions,
  openSession,
  sealSession,
  accessNeedsRefresh,
} from "./lib/session-cookie";
export async function proxy(req: NextRequest) {
  const expected = process.env.SITES_PROXY_SECRET;
  const supplied = req.headers.get("x-sites-backend-token") || "";
  if (
    expected &&
    (supplied.length !== expected.length ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected)))
  )
    return NextResponse.json(
      { error: "Access through the application site." },
      { status: 401 },
    );
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.nextUrl.pathname !== "/api/platform/stripe"
  ) {
    const origin = req.headers.get("origin");
    const allowed = process.env.PUBLIC_APP_ORIGIN || req.nextUrl.origin;
    if (origin !== allowed && origin !== req.nextUrl.origin)
      return NextResponse.json(
        { error: "Invalid request origin" },
        { status: 403 },
      );
  }
  let renewed: {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
  } | null = null;
  let expired = false;
  const loginExchange =
    req.method === "POST" &&
    ["/api/platform/auth", "/api/session"].includes(req.nextUrl.pathname);
  const asset =
    req.nextUrl.pathname.startsWith("/_next/") ||
    /\.(?:svg|png|jpg|ico|css|js|woff2?)$/.test(req.nextUrl.pathname);
  const sealed =
    loginExchange || asset ? undefined : req.cookies.get(REFRESH_COOKIE)?.value;
  const session = sealed ? openSession(sealed) : null;
  if (sealed && !session) {
    expired = true;
    req.cookies.delete(SESSION_COOKIE);
    req.cookies.delete(REFRESH_COOKIE);
  }
  if (session && accessNeedsRefresh(req.cookies.get(SESSION_COOKIE)?.value)) {
    try {
      const result = await fetch(
        `${process.env.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
        {
          method: "POST",
          headers: {
            apikey: process.env.SUPABASE_PUBLISHABLE_KEY!,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ refresh_token: session.token }),
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        },
      );
      if (result.ok) {
        const data = await result.json();
        if (data.access_token && data.refresh_token) {
          renewed = data;
          req.cookies.set(SESSION_COOKIE, data.access_token);
        }
      } else if (result.status === 400 || result.status === 401) {
        expired = true;
        req.cookies.delete(SESSION_COOKIE);
        req.cookies.delete(REFRESH_COOKIE);
      }
    } catch {
      /* Keep refresh credentials through transient outages. */
    }
  }
  const response = NextResponse.next({ request: { headers: req.headers } });
  if (expired) {
    response.cookies.delete(SESSION_COOKIE);
    response.cookies.delete(REFRESH_COOKIE);
  }
  if (renewed && session) {
    const remaining = Math.max(
      0,
      Math.floor((session.expires - Date.now()) / 1000),
    );
    response.cookies.set(SESSION_COOKIE, renewed.access_token, {
      ...cookieOptions,
      maxAge: Math.min(remaining, renewed.expires_in || 3600),
    });
    response.cookies.set(
      REFRESH_COOKIE,
      sealSession({ token: renewed.refresh_token, expires: session.expires }),
      { ...cookieOptions, maxAge: remaining },
    );
  }
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Cache-Control", "no-store");
  return response;
}
export const config = { matcher: ["/:path*"] };
