import { NextRequest, NextResponse } from "next/server";
import { requireUser, supabaseService } from "../lib";

export const dynamic = "force-dynamic";

// GET: list all scraper sources (auth required)
export async function GET(req: NextRequest) {
  const { response: unauthorized } = await requireUser(req);
  if (unauthorized) return unauthorized;

  try {
    const { data, error } = await supabaseService()
      .from("scraper_sources")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ success: true, sources: data ?? [] });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed to load sources" },
      { status: 500 }
    );
  }
}

// POST: create a new scraper source
export async function POST(req: NextRequest) {
  const { response: unauthorized } = await requireUser(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json();
    const { name, url, enabled } = body;

    if (!name || !url) {
      return NextResponse.json({ success: false, error: "Missing required fields: name, url" }, { status: 400 });
    }

    const { data, error } = await supabaseService()
      .from("scraper_sources")
      .insert({ name, url, enabled: enabled ?? true })
      .select("*")
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, source: data });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed to create source" },
      { status: 500 }
    );
  }
}
