import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  outputFileTracingIncludes: {
    "/api/backtest": ["./data/**"],
    "/api/data-files": ["./data/**"],
    "/api/spy-data": ["./data/**"],
  },
};

export default nextConfig;
