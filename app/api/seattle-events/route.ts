import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function supabaseService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// GET: list upcoming Seattle events (unauthenticated). Optional ?date=YYYY-MM-DD and ?limit=
export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get("date");
    const limitParam = req.nextUrl.searchParams.get("limit");
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 200) : 50;

    let q = supabaseService()
      .from("seattle_events")
      .select("name, venue, time, description, link")
      .order("time", { ascending: true })
      .limit(limit);

    if (date) {
      const start = new Date(date);
      if (isNaN(start.getTime())) {
        return NextResponse.json({ success: false, error: "Invalid date" }, { status: 400 });
      }
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      q = q.gte("time", start.toISOString()).lt("time", end.toISOString());
    } else {
      q = q.gte("time", new Date().toISOString());
    }

    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ success: true, events: data ?? [] });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed to load events" },
      { status: 500 }
    );
  }
}
