async function hmacB64url(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(process.env.MCP_API_KEY ?? ""),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  let str = "";
  for (const b of new Uint8Array(sig)) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// Derives a client_secret deterministically from client_id + MCP_API_KEY.
// No database needed — any client registered by this server can be re-verified.
export async function deriveClientSecret(clientId: string): Promise<string> {
  return hmacB64url(`dcr:${clientId}`);
}

export async function verifyClient(clientId: string, clientSecret: string): Promise<boolean> {
  if (!clientId || !clientSecret || !process.env.MCP_API_KEY) return false;
  const expected = await deriveClientSecret(clientId);
  return expected === clientSecret;
}
