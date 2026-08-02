import { NextRequest, NextResponse } from "next/server";
import { supabaseAnon, supabaseService, ScraperSource } from "../lib";

export const dynamic = "force-dynamic";

const FETCH_TIMEOUT_MS = 15000;

// Identify the scraper honestly. A stable, contactable UA is what a site operator keys on when
// allowlisting us, and it is what lets them throttle or reach us instead of silently blocking.
// Override with SCRAPER_USER_AGENT (e.g. a token a site issues us).
const SCRAPER_USER_AGENT =
  process.env.SCRAPER_USER_AGENT ??
  "iCodeForBananasBot/1.0 (+https://icodeforbananas.com; events aggregator; contact michaeljamescalkins@gmail.com)";

interface ScrapeResult {
  id: string;
  name: string;
  url: string;
  status: "success" | "error";
  error?: string;
  detail?: string;
}

// Node's fetch reports most network failures as a bare "fetch failed" and puts the real
// reason (DNS, TLS, ECONNREFUSED, …) on e.cause. Walk the chain so the admin UI shows it.
function describeError(e: unknown): string {
  if (!(e instanceof Error)) return String(e ?? "Unknown error");

  const parts: string[] = [];
  let current: unknown = e;
  const seen = new Set<unknown>();

  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    const code = (current as NodeJS.ErrnoException).code;
    parts.push(code ? `${current.name}: ${current.message} (${code})` : `${current.name}: ${current.message}`);
    current = current.cause;
  }

  return parts.join(" ← ");
}

// Supabase returns errors as a value, not a throw. Keep every field it gives us.
function describeDbError(error: { message: string; code?: string; details?: string; hint?: string }): string {
  return [
    error.code ? `[${error.code}]` : null,
    error.message,
    error.details ? `details: ${error.details}` : null,
    error.hint ? `hint: ${error.hint}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

async function recordResult(
  source: ScraperSource,
  status: "success" | "error",
  html: string | null,
  errorMessage: string | null
): Promise<string | null> {
  const db = supabaseService();
  const now = new Date().toISOString();
  const dbErrors: string[] = [];

  const { error: insertError } = await db.from("scraper_results").insert({
    source_id: source.id,
    url: source.url,
    html_content: html,
    status,
    error_message: errorMessage,
  });
  if (insertError) dbErrors.push(`scraper_results insert failed — ${describeDbError(insertError)}`);

  const { error: updateError } = await db
    .from("scraper_sources")
    .update({
      last_scraped_at: now,
      last_status: status,
      last_error: errorMessage,
      updated_at: now,
    })
    .eq("id", source.id);
  if (updateError) dbErrors.push(`scraper_sources update failed — ${describeDbError(updateError)}`);

  return dbErrors.length > 0 ? dbErrors.join("; ") : null;
}

// A bot-protection interstitial returns 2xx with a challenge page instead of the real content.
// Without this, res.ok is true and we would store the interstitial as a successful scrape.
function detectChallenge(res: Response, html: string): string | null {
  const wafAction = res.headers.get("x-amzn-waf-action");
  if (wafAction) return `AWS WAF returned a "${wafAction}" interstitial instead of the page`;

  if (res.headers.get("cf-mitigated") === "challenge") return "Cloudflare returned a challenge instead of the page";

  const markers: [RegExp, string][] = [
    [/AwsWafIntegration|awsWafCookieDomainList/, "AWS WAF challenge script"],
    [/__cf_chl_|cf-browser-verification|Checking your browser before accessing/i, "Cloudflare challenge page"],
    [/_Incapsula_Resource|Incapsula incident ID/i, "Imperva/Incapsula block page"],
    [/PX\d{2,}|px-captcha/, "PerimeterX challenge page"],
    [/datadome|geo\.captcha-delivery\.com/i, "DataDome challenge page"],
  ];
  for (const [re, label] of markers) {
    if (re.test(html)) return `Received a ${label} instead of the page`;
  }

  return null;
}

async function scrapeSource(source: ScraperSource): Promise<ScrapeResult> {
  const base = { id: source.id, name: source.name, url: source.url };

  let res: Response;
  let html: string;
  try {
    res = await fetch(source.url, {
      headers: { "User-Agent": SCRAPER_USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    html = await res.text();
  } catch (e) {
    const errorMessage =
      e instanceof Error && e.name === "TimeoutError"
        ? `Request timed out after ${FETCH_TIMEOUT_MS}ms`
        : describeError(e);
    const dbError = await recordResult(source, "error", null, errorMessage);
    return { ...base, status: "error", error: errorMessage, detail: dbError ?? undefined };
  }

  if (!res.ok) {
    // Include a snippet of the body — error pages usually say why (rate limit, blocked, etc.).
    const snippet = html.trim().slice(0, 300).replace(/\s+/g, " ");
    const errorMessage = `HTTP ${res.status} ${res.statusText}${snippet ? ` — ${snippet}` : ""}`;
    const dbError = await recordResult(source, "error", html, errorMessage);
    return { ...base, status: "error", error: errorMessage, detail: dbError ?? undefined };
  }

  const challenge = detectChallenge(res, html);
  if (challenge) {
    const errorMessage =
      `${challenge} (HTTP ${res.status} ${res.statusText}, ${html.length} bytes). ` +
      `The site is refusing automated requests — ask the site owner to allowlist this scraper.`;
    const dbError = await recordResult(source, "error", html, errorMessage);
    return { ...base, status: "error", error: errorMessage, detail: dbError ?? undefined };
  }

  const dbError = await recordResult(source, "success", html, null);
  if (dbError) {
    // The page fetched fine but we failed to store it — that is a failed scrape, not a success.
    return { ...base, status: "error", error: `Fetched OK but saving failed — ${dbError}` };
  }

  return { ...base, status: "success" };
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

function missingEnvVars(): string[] {
  return (["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const).filter((k) => !process.env[k]);
}

async function runScraper(req: NextRequest) {
  try {
    if (!(await isAuthorized(req))) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const missing = missingEnvVars();
    if (missing.length > 0) {
      return NextResponse.json(
        { success: false, error: `Server is missing environment variables: ${missing.join(", ")}` },
        { status: 500 }
      );
    }

    const { data: sources, error } = await supabaseService()
      .from("scraper_sources")
      .select("*")
      .eq("enabled", true);

    if (error) {
      return NextResponse.json(
        { success: false, error: `Could not load sources — ${describeDbError(error)}` },
        { status: 500 }
      );
    }

    const results = await Promise.all((sources ?? []).map((s) => scrapeSource(s as ScraperSource)));
    const succeeded = results.filter((r) => r.status === "success").length;
    const failed = results.filter((r) => r.status === "error").length;

    // success reports whether the run executed; check summary.failed for per-source outcomes.
    return NextResponse.json({
      success: true,
      summary: { total: results.length, succeeded, failed },
      results,
    });
  } catch (e) {
    // Never let the route crash into an HTML 500 — the admin UI needs a readable message.
    console.error("[scraper/run] unhandled error", e);
    return NextResponse.json(
      {
        success: false,
        error: describeError(e),
        stack: e instanceof Error ? e.stack : undefined,
      },
      { status: 500 }
    );
  }
}

// Called by Vercel cron (see vercel.json).
export async function GET(req: NextRequest) {
  return runScraper(req);
}

// Called by the "Run Scraper Now" button in the admin UI.
export async function POST(req: NextRequest) {
  return runScraper(req);
}
