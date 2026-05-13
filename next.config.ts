import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  outputFileTracingIncludes: {
    "/api/csv": ["./data/**"],
    "/api/data-files": ["./data/**"],
    "/api/spy-data": ["./data/**"],
  },
};

export default nextConfig;
