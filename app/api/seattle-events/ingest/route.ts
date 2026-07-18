import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

interface SeattleEventInput {
  name: string;
  venue: string;
  time: string;
  description?: string;
  link: string;
}

function supabaseService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// POST: upsert a batch of scraped Seattle events (unauthenticated — for a private scraper).
// Body: an array of { name, venue, time, description?, link }. Deduped by `link`.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const events: SeattleEventInput[] = Array.isArray(body) ? body : body?.events;
    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ success: false, error: "Expected a non-empty array of events" }, { status: 400 });
    }
    for (const e of events) {
      if (!e.name || !e.venue || !e.time || !e.link) {
        return NextResponse.json(
          { success: false, error: "Each event requires name, venue, time, and link" },
          { status: 400 }
        );
      }
    }

    const rows = events.map((e) => ({
      name: e.name,
      venue: e.venue,
      time: e.time,
      description: e.description ?? "",
      link: e.link,
      updated_at: new Date().toISOString(),
    }));

    const { data, error } = await supabaseService()
      .from("seattle_events")
      .upsert(rows, { onConflict: "link" })
      .select("id, name, link");
    if (error) throw error;

    return NextResponse.json({ success: true, upserted: data?.length ?? 0 });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed to ingest events" },
      { status: 500 }
    );
  }
}
