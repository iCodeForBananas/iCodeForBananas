import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  outputFileTracingIncludes: {
    "/api/csv": ["./data/**"],
    "/api/data-files": ["./data/**"],
    "/api/spy-data": ["./data/**"],
  },
  async rewrites() {
    return [
      {
        source: "/.well-known/oauth-authorization-server",
        destination: "/api/oauth/well-known",
      },
    ];
  },
};

export default nextConfig;
