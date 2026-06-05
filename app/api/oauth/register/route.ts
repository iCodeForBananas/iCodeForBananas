import { NextRequest, NextResponse } from "next/server";
import { deriveClientSecret } from "@/lib/mcp-oauth";

export const dynamic = "force-dynamic";

// RFC 7591 Dynamic Client Registration
export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* registration request body is optional */ }

  const clientId = crypto.randomUUID();
  const clientSecret = await deriveClientSecret(clientId);

  // RFC 7591 §3.2: server MUST return all registered metadata including fields from the request
  return NextResponse.json({
    grant_types: ["authorization_code"],
    response_types: ["code"],
    token_endpoint_auth_method: "client_secret_basic",
    ...body,
    client_id: clientId,
    client_secret: clientSecret,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_secret_expires_at: 0,
  }, { status: 201 });
}
