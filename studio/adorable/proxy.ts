import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
export function proxy(req: NextRequest) {
  const expected=process.env.SITES_PROXY_SECRET;
  const supplied=req.headers.get("x-sites-backend-token") || "";
  if(expected && (supplied.length!==expected.length || !timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))) return NextResponse.json({error:"Access through the application site."},{status:401});
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin=req.headers.get("origin");
    const allowed=process.env.PUBLIC_APP_ORIGIN || req.nextUrl.origin;
    if(origin!==allowed && origin!==req.nextUrl.origin) return NextResponse.json({error:"Invalid request origin"},{status:403});
  }
  const response=NextResponse.next();
  response.headers.set("Referrer-Policy","no-referrer");
  response.headers.set("X-Content-Type-Options","nosniff");
  response.headers.set("Cache-Control","no-store");
  return response;
}
export const config={matcher:["/:path*"]};
