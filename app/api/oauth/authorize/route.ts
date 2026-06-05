import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Self-contained signed code — no storage needed, serverless-safe.
// Payload embeds code_challenge + redirect_uri + expiry, signed with MCP_API_KEY.
async function makeCode(codeChallenge: string, redirectUri: string): Promise<string> {
  const payload = btoa(
    JSON.stringify({ cc: codeChallenge, ru: redirectUri, exp: Date.now() + 5 * 60 * 1000 })
  );
  const secret = process.env.MCP_API_KEY ?? "";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  let str = "";
  for (const b of new Uint8Array(sigBuf)) str += String.fromCharCode(b);
  const sig = btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  return `${payload}.${sig}`;
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const clientId = p.get("client_id") ?? "";
  const redirectUri = p.get("redirect_uri") ?? "";
  const state = p.get("state") ?? "";
  const codeChallenge = p.get("code_challenge") ?? "";
  const codeChallengeMethod = p.get("code_challenge_method") ?? "";

  if (!clientId) {
    return new Response("Missing client_id", { status: 400 });
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Authorize Claude.ai — iCodeForBananas</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0a;color:#e5e5e5;display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{background:#111;border:1px solid #2a2a2a;border-radius:14px;padding:2rem;max-width:380px;width:90%;text-align:center}
h1{font-size:1.2rem;font-weight:600;margin-bottom:.5rem}
.sub{color:#888;font-size:.875rem;margin-bottom:1.5rem;line-height:1.5}
.scopes{background:#0a0a0a;border:1px solid #1f1f1f;border-radius:8px;padding:.875rem 1rem;margin-bottom:1.5rem;text-align:left}
.scope{font-size:.8rem;color:#bbb;padding:.2rem 0;display:flex;gap:.5rem;align-items:baseline}
.scope::before{content:"✓";color:#4ade80;font-size:.75rem;flex-shrink:0}
.btn{display:block;width:100%;padding:.7rem;border-radius:8px;border:none;cursor:pointer;font-size:.9rem;font-weight:500;transition:opacity .15s}
.approve{background:#fff;color:#000;margin-bottom:.5rem}
.approve:hover{opacity:.9}
.deny{background:transparent;color:#555;border:1px solid #2a2a2a}
.deny:hover{color:#888}
</style>
</head>
<body>
<div class="card">
  <h1>Authorize Claude.ai</h1>
  <p class="sub">Claude.ai is requesting access to your iCodeForBananas data.</p>
  <div class="scopes">
    <div class="scope">Notes (Wordsmith)</div>
    <div class="scope">Tasks (Task Board)</div>
    <div class="scope">Trading strategies &amp; trades</div>
    <div class="scope">Space Math progress</div>
    <div class="scope">Lead sheets</div>
  </div>
  <form method="POST">
    <input type="hidden" name="client_id" value="${esc(clientId)}">
    <input type="hidden" name="redirect_uri" value="${esc(redirectUri)}">
    <input type="hidden" name="state" value="${esc(state)}">
    <input type="hidden" name="code_challenge" value="${esc(codeChallenge)}">
    <input type="hidden" name="code_challenge_method" value="${esc(codeChallengeMethod)}">
    <button type="submit" name="action" value="approve" class="btn approve">Authorize</button>
    <button type="submit" name="action" value="deny" class="btn deny">Deny</button>
  </form>
</div>
</body>
</html>`;

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function POST(req: NextRequest) {
  const body = await req.formData();
  const action = body.get("action") as string;
  const clientId = body.get("client_id") as string;
  const redirectUri = body.get("redirect_uri") as string;
  const state = body.get("state") as string;
  const codeChallenge = body.get("code_challenge") as string;

  let redirectBase: URL | null = null;
  try {
    redirectBase = new URL(redirectUri);
  } catch {
    return new Response("Invalid redirect_uri", { status: 400 });
  }

  if (action !== "approve" || !clientId) {
    redirectBase.searchParams.set("error", "access_denied");
    if (state) redirectBase.searchParams.set("state", state);
    return NextResponse.redirect(redirectBase.toString(), { status: 303 });
  }

  const code = await makeCode(codeChallenge, redirectUri);
  redirectBase.searchParams.set("code", code);
  if (state) redirectBase.searchParams.set("state", state);
  return NextResponse.redirect(redirectBase.toString(), { status: 303 });
}
