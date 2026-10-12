import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  output: "standalone",
  outputFileTracingIncludes: {"/*": ["./config/supabase-ca.crt"]},
};

export default nextConfig;
