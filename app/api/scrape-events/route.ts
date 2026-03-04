import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import https from 'https';
import { createClient } from '@supabase/supabase-js';
import { EVENT_SOURCES } from '@/app/lib/eventSources';
import { getGeminiApiKey } from '@/app/api/gemini-key/route';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

export const dynamic = 'force-dynamic';

const GEMINI_PROMPT = (currentYear: number) => `
You are an event extraction assistant. Given raw HTML from an events page, extract all events you can find.
The current year is ${currentYear}. If no year is present in an event date, assume it is ${currentYear}.
Return a JSON array of objects with this exact shape:
[
  {
    "name": "Event name",
    "venue": "Venue name",
    "address": "Full address if available",
    "date": "ISO 8601 date or datetime. If time is known use datetime with offset (e.g. 2025-07-15T19:00:00-07:00). If no time is available use date only (e.g. 2025-07-15). If no year is present assume ${currentYear}.",
    "time": "Time string (e.g. 7:30 PM) or null if unknown",
    "price": 20 or null if free/unknown,
    "category": "One of: Live Music, Comedy, Art, Sports, Food & Drink, Festival, Other",
    "description": "1-2 sentence description",
    "eventUrl": "Fully qualified URL including scheme, hostname, path and any required query params (e.g. https://example.com/events/123). Must be a direct link to this specific event. If no direct event link exists use null."
  }
]
Return ONLY the JSON array, no markdown, no explanation.
`.trim();

const GOOGLE_CALENDAR_API_KEY = 'AIzaSyDOtGM5jr8bNp1utVpG2_gSRH03RNGBkI8';

async function fetchGoogleCalendarEvents(calendarId: string, sourceLabel: string, sourceUrl: string) {
  const now = new Date();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const nextWeek = new Date(now); nextWeek.setDate(now.getDate() + 7);
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?singleEvents=true&eventTypes=default&maxResults=250&sanitizeHtml=true&timeMin=${yesterday.toISOString()}&timeMax=${nextWeek.toISOString()}&key=${GOOGLE_CALENDAR_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google Calendar API error: ${res.status}`);
  const data = await res.json();
  return (data.items ?? []).map((item: Record<string, unknown>) => {
    const startObj = item.start as Record<string, string>;
    const dateTimeStr = startObj?.dateTime ?? startObj?.date;
    const tz = startObj?.timeZone;
    // Parse the dateTime preserving the original offset (don't convert to UTC)
    const localDate = dateTimeStr
      ? new Date(dateTimeStr).toLocaleString('sv-SE', { timeZone: tz ?? 'America/Los_Angeles' }).replace(' ', 'T')
      : null;
    const timeStr = dateTimeStr
      ? new Date(dateTimeStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz ?? 'America/Los_Angeles' })
      : null;
    return {
      name: item.summary ?? 'Untitled Event',
      venue: sourceLabel,
      address: null,
      date: localDate,
      time: timeStr,
      price: null,
      category: 'Other',
      description: (item.description as string) ?? null,
      eventUrl: sourceUrl,
      lat: null,
      lng: null,
    };
  });
}

async function scrapeUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { rejectUnauthorized: false, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EventScraper/1.0)' } },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(data));
      },
    );
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
    req.on('error', reject);
  });
}

async function extractEventsWithGemini(ai: GoogleGenAI, html: string, sourceLabel: string) {
  // Trim HTML to avoid token limits — first 30k chars is usually enough
  const truncated = html.slice(0, 30000);

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [{ role: 'user', parts: [{ text: `${GEMINI_PROMPT(new Date().getFullYear())}\n\nHTML:\n${truncated}` }] }],
  });

  const raw = response.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';
  const text = raw
    .replace(/^```json\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

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
    return NextResponse.json({ error: 'Gemini API key not set' }, { status: 401 });
  }

  if (EVENT_SOURCES.length === 0) {
    return NextResponse.json({ events: [], message: 'No event sources configured in app/lib/eventSources.ts' });
  }

  const ai = new GoogleGenAI({ apiKey });

  const results = await Promise.all(
    EVENT_SOURCES.map(async (source) => {
      try {
        console.log(`[scrape-events] Fetching: ${source.label} (${source.url})`);
        const events = source.googleCalendarId
          ? await fetchGoogleCalendarEvents(source.googleCalendarId, source.label, source.url)
          : await extractEventsWithGemini(ai, await scrapeUrl(source.url), source.label);
        const tagged = events.map((e: Record<string, unknown>, i: number) => ({
          ...e,
          id: `${source.label}-${i}`,
          source: source.label,
          eventUrl: (e.eventUrl as string | null) ?? source.url,
          ...(source.lat != null && { lat: source.lat }),
          ...(source.lng != null && { lng: source.lng }),
        }));

        await supabase.from('events').delete().eq('source', source.label);
        if (tagged.length > 0) {
          const { error } = await supabase.from('events').insert(tagged);
          if (error) console.error(`[scrape-events] Supabase insert error (${source.label}):`, error.message);
          else console.log(`[scrape-events] Inserted ${tagged.length} events for ${source.label}`);
        }

        return tagged;
      } catch (err) {
        console.error(`[scrape-events] Error processing ${source.label}:`, err);
        return [];
      }
    }),
  );

  const allEvents = results.flat();
  console.log(`[scrape-events] Total events extracted: ${allEvents.length}`);

  return NextResponse.json({ events: allEvents });
}
