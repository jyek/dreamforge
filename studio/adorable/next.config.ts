import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import { join } from "node:path";

// Local npm workspaces hoist dependencies; Vercel installs inside this app.
// Do not pass parent-directory globs to an isolated Vercel project root.
const browserModules = existsSync(join(__dirname, "node_modules/@sparticuz/chromium"))
  ? "./node_modules"
  : "../node_modules";

const nextConfig: NextConfig = {
  devIndicators: false,
  serverExternalPackages: ["@sparticuz/chromium", "playwright-core"],
  output: "standalone",
  outputFileTracingIncludes: {
    "/*": ["./config/supabase-ca.crt"],
    // Only chat runs browser verification. Do not duplicate Chromium into
    // every page and API function retained by Vercel.
    "/api/chat": [
      `${browserModules}/@sparticuz/chromium/bin/**`,
      `${browserModules}/playwright-core/**`,
    ],
  },
};

export default nextConfig;
