import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  outputFileTracingIncludes: {
    "/api/strategy-source": ["./app/strategies/**"],
  },
  // The lead sheet editor became Songwriter. Keep old bookmarks and shared
  // song links working.
  async redirects() {
    return [
      { source: "/lead-sheet-editor", destination: "/songwriter", permanent: true },
      { source: "/lead-sheet-editor/:path*", destination: "/songwriter/:path*", permanent: true },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/.well-known/oauth-authorization-server",
        destination: "/api/oauth/well-known",
      },
      {
        source: "/.well-known/oauth-protected-resource",
        destination: "/api/oauth/protected-resource",
      },
    ];
  },
};

export default nextConfig;
