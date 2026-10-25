import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  turbopack: { root: __dirname },
  serverExternalPackages: ["@sparticuz/chromium", "playwright-core"],
  output: "standalone",
  outputFileTracingIncludes: {
    "/*": ["./config/supabase-ca.crt"],
    // Only chat runs browser verification. Do not duplicate Chromium into
    // every page and API function retained by Vercel.
    "/api/chat": [
      "./node_modules/@sparticuz/chromium/bin/**",
      "./node_modules/playwright-core/**",
    ],
  },
};

export default nextConfig;
