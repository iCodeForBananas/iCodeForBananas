import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface CodePayload {
  cc: string;   // code_challenge
  ru: string;   // redirect_uri
  exp: number;  // expiry ms
}

async function verifyCode(code: string): Promise<CodePayload | null> {
  const parts = code.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;

  const secret = process.env.MCP_API_KEY ?? "";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  let sigBytes: Uint8Array;
  try {
    const padded = sig.replace(/-/g, "+").replace(/_/g, "/");
    sigBytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }

  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes as unknown as ArrayBufferView,
    new TextEncoder().encode(payload) as unknown as ArrayBufferView
  );
  if (!valid) return null;

  let data: CodePayload;
  try {
    data = JSON.parse(atob(payload));
  } catch {
    return null;
  }

  if (Date.now() > data.exp) return null;
  return data;
}

async function verifyPKCE(codeVerifier: string, codeChallenge: string): Promise<boolean> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  let str = "";
  for (const b of new Uint8Array(hash)) str += String.fromCharCode(b);
  const challenge = btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  return challenge === codeChallenge;
}

function err(code: string, status: number) {
  return NextResponse.json({ error: code }, { status });
}

export async function POST(req: NextRequest) {
  // Accept both application/x-www-form-urlencoded and application/json
  const ct = req.headers.get("content-type") ?? "";
  const params: Record<string, string> = {};

  if (ct.includes("application/json")) {
    const json = await req.json();
    Object.assign(params, json);
  } else {
    const text = await req.text();
    new URLSearchParams(text).forEach((v, k) => { params[k] = v; });
  }

  const { grant_type, code, client_id, client_secret, code_verifier, redirect_uri } = params;

  if (grant_type !== "authorization_code") return err("unsupported_grant_type", 400);
  if (
    !process.env.MCP_OAUTH_CLIENT_ID ||
    !process.env.MCP_OAUTH_CLIENT_SECRET ||
    client_id !== process.env.MCP_OAUTH_CLIENT_ID ||
    client_secret !== process.env.MCP_OAUTH_CLIENT_SECRET
  ) {
    return err("invalid_client", 401);
  }
  if (!code) return err("invalid_grant", 400);

  const payload = await verifyCode(code);
  if (!payload) return err("invalid_grant", 400);

  if (redirect_uri && payload.ru !== redirect_uri) return err("invalid_grant", 400);

  if (payload.cc && code_verifier) {
    const ok = await verifyPKCE(code_verifier, payload.cc);
    if (!ok) return err("invalid_grant", 400);
  }

  return NextResponse.json({
    access_token: process.env.MCP_API_KEY,
    token_type: "bearer",
    expires_in: 315360000, // ~10 years
  });
}
