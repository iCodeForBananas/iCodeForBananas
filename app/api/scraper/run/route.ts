import { NextRequest, NextResponse } from "next/server";
import { supabaseAnon, supabaseService, ScraperSource } from "../lib";

export const dynamic = "force-dynamic";

const FETCH_TIMEOUT_MS = 15000;

async function scrapeSource(source: ScraperSource) {
  const db = supabaseService();
  const now = new Date().toISOString();

  try {
    const res = await fetch(source.url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    const html = await res.text();

    if (!res.ok) {
      const errorMessage = `HTTP ${res.status} ${res.statusText}`;
      await db.from("scraper_results").insert({
        source_id: source.id,
        url: source.url,
        html_content: html,
        status: "error",
        error_message: errorMessage,
      });
      await db
        .from("scraper_sources")
        .update({ last_scraped_at: now, last_status: "error", last_error: errorMessage, updated_at: now })
        .eq("id", source.id);
      return { id: source.id, name: source.name, status: "error", error: errorMessage };
    }

    await db.from("scraper_results").insert({
      source_id: source.id,
      url: source.url,
      html_content: html,
      status: "success",
    });
    await db
      .from("scraper_sources")
      .update({ last_scraped_at: now, last_status: "success", last_error: null, updated_at: now })
      .eq("id", source.id);
    return { id: source.id, name: source.name, status: "success" };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Failed to fetch";
    await db.from("scraper_results").insert({
      source_id: source.id,
      url: source.url,
      html_content: null,
      status: "error",
      error_message: errorMessage,
    });
    await db
      .from("scraper_sources")
      .update({ last_scraped_at: now, last_status: "error", last_error: errorMessage, updated_at: now })
      .eq("id", source.id);
    return { id: source.id, name: source.name, status: "error", error: errorMessage };
  }
}

// Authorized if called by Vercel cron with CRON_SECRET, or by an authenticated user session.
async function isAuthorized(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("Authorization");
    if (auth === `Bearer ${cronSecret}`) return true;
  }

  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return false;
  const { data: { user }, error } = await supabaseAnon().auth.getUser(token);
  return !error && !!user;
}

async function runScraper(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const { data: sources, error } = await supabaseService()
    .from("scraper_sources")
    .select("*")
    .eq("enabled", true);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const results = await Promise.all((sources ?? []).map((s) => scrapeSource(s as ScraperSource)));
  const succeeded = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "error").length;

  return NextResponse.json({
    success: true,
    summary: { total: results.length, succeeded, failed },
    results,
  });
}

// Called by Vercel cron (see vercel.json).
export async function GET(req: NextRequest) {
  return runScraper(req);
}

// Called by the "Run Scraper Now" button in the admin UI.
export async function POST(req: NextRequest) {
  return runScraper(req);
}
