import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
export function proxy(req: NextRequest) {
  if (
    process.env.VERCEL_SANDBOX_TEST_ENABLED === "true" &&
    process.env.VERCEL_ENV !== "production"
  ) {
    const path = req.nextUrl.pathname;
    if (path === "/")
      return NextResponse.redirect(new URL("/sandbox-test", req.url));
    if (
      !(
        path === "/sandbox-test" ||
        path === "/api/sandbox-test" ||
        (path === "/api/session" && req.method === "GET") ||
        path.startsWith("/_next/") ||
        path === "/favicon.ico"
      )
    )
      return NextResponse.json(
        {
          error:
            "Only the isolated sandbox pilot is enabled in this deployment.",
        },
        { status: 404 },
      );
  }
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
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.get("origin");
    const allowed = process.env.PUBLIC_APP_ORIGIN || req.nextUrl.origin;
    if (origin !== allowed && origin !== req.nextUrl.origin)
      return NextResponse.json(
        { error: "Invalid request origin" },
        { status: 403 },
      );
  }
  const response = NextResponse.next();
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Cache-Control", "no-store");
  return response;
}
export const config = { matcher: ["/:path*"] };
