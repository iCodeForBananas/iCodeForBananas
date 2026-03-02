import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { EVENT_SOURCES } from "@/app/lib/eventSources";
import { getGeminiApiKey } from "@/app/api/gemini-key/route";

export const dynamic = "force-dynamic";

const GEMINI_PROMPT = `
You are an event extraction assistant. Given raw HTML from an events page, extract all events you can find.
Return a JSON array of objects with this exact shape:
[
  {
    "name": "Event name",
    "venue": "Venue name",
    "address": "Full address if available",
    "time": "Time string (e.g. 7:30 PM)",
    "price": 20 or null if free/unknown,
    "category": "One of: Live Music, Comedy, Art, Sports, Food & Drink, Festival, Other",
    "description": "1-2 sentence description",
    "lat": null,
    "lng": null,
    "imageEmoji": "A single relevant emoji"
  }
]
Return ONLY the JSON array, no markdown, no explanation.
`.trim();

async function scrapeUrl(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; EventScraper/1.0)" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function extractEventsWithGemini(
  ai: GoogleGenAI,
  html: string,
  sourceLabel: string
) {
  // Trim HTML to avoid token limits — first 30k chars is usually enough
  const truncated = html.slice(0, 30000);

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: [{ role: "user", parts: [{ text: `${GEMINI_PROMPT}\n\nHTML:\n${truncated}` }] }],
  });

  const text = response.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";

  try {
    const events = JSON.parse(text);
    console.log(`[scrape-events] ${sourceLabel}: extracted ${events.length} events`);
    return events;
  } catch {
    console.error(`[scrape-events] ${sourceLabel}: failed to parse Gemini response`, text.slice(0, 200));
    return [];
  }
}

export async function GET(req: NextRequest) {
  const apiKey = getGeminiApiKey(req);
  if (!apiKey) {
    return NextResponse.json({ error: "Gemini API key not set" }, { status: 401 });
  }

  if (EVENT_SOURCES.length === 0) {
    return NextResponse.json({ events: [], message: "No event sources configured in app/lib/eventSources.ts" });
  }

  const ai = new GoogleGenAI({ apiKey });
  const allEvents: unknown[] = [];

  for (const source of EVENT_SOURCES) {
    try {
      console.log(`[scrape-events] Fetching: ${source.label} (${source.url})`);
      const html = await scrapeUrl(source.url);
      const events = await extractEventsWithGemini(ai, html, source.label);
      // Tag each event with a unique id and source
      const tagged = events.map((e: Record<string, unknown>, i: number) => ({
        ...e,
        id: `${source.label}-${i}`,
        source: source.label,
      }));
      allEvents.push(...tagged);
    } catch (err) {
      console.error(`[scrape-events] Error processing ${source.label}:`, err);
    }
  }

  console.log(`[scrape-events] Total events extracted: ${allEvents.length}`);
  return NextResponse.json({ events: allEvents });
}
