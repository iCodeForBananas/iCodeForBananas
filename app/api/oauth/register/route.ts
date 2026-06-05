import { NextResponse } from "next/server";
import { deriveClientSecret } from "@/lib/mcp-oauth";

export const dynamic = "force-dynamic";

// RFC 7591 Dynamic Client Registration
export async function POST() {
  const clientId = crypto.randomUUID();
  const clientSecret = await deriveClientSecret(clientId);

  return NextResponse.json({
    client_id: clientId,
    client_secret: clientSecret,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_secret_expires_at: 0,
  });
}
