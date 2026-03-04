import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function getGeminiApiKey(req: NextRequest): string | null {
  return req.cookies.get("gemini_api_key")?.value ?? process.env.GEMINI_API_KEY ?? null;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { apiKey } = body;
  const trimmedKey = typeof apiKey === "string" ? apiKey.trim() : "";

  if (!trimmedKey) {
    return NextResponse.json({ error: "Missing or invalid API key" }, { status: 400 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set("gemini_api_key", trimmedKey, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 172800, // 2 days in seconds
    path: "/",
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set("gemini_api_key", "", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 0,
    path: "/",
  });
  return response;
}
