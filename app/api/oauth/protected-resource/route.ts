import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? "www.icodeforbananas.com";
  const authServer = `${proto}://${host}`;

  return NextResponse.json({
    resource: "https://icodeforbananas.com/api/mcp",
    authorization_servers: [authServer],
    scopes_supported: ["mcp"],
  });
}
