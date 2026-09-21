/**
 * Where the backtester's historical bars come from.
 *
 * Sub-hour intervals (1m, 2m, 5m, 15m, 30m) used to come from Yahoo Finance,
 * which only serves the last 7 days of 1m and the last 59 days of the rest.
 * Those now come from Polygon.io, a full year at a time. Everything else
 * (hourly, daily, weekly...) was already served for a year or more, so it stays
 * on Yahoo with its existing window rather than shrinking.
 *
 * Polygon needs POLYGON_API_KEY, read from the environment or from .env.local /
 * .env in the working directory (never from source). Without a key, or for a
 * symbol Polygon's stock aggregates don't carry (futures like ES=F), a sub-hour
 * interval falls back to Yahoo's short window and says so — it never quietly
 * hands back less than it claims.
 */

import path from "node:path";
import YahooFinance from "yahoo-finance2";

for (const file of [".env.local", ".env"]) {
  try {
    // Does not override anything already set in the environment.
    process.loadEnvFile(path.join(process.cwd(), file));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const DAY_MS = 24 * 60 * 60 * 1000;

/** How much history the backtester wants from Polygon, in days. */
export const POLYGON_LOOKBACK_DAYS = 365;

/** Polygon's hard cap on bars in one aggregates response. */
export const POLYGON_PAGE_LIMIT = 50000;

/** Intervals served by Polygon: [multiplier, timespan]. */
const POLYGON_SPANS = {
  "1m": [1, "minute"],
  "2m": [2, "minute"],
  "5m": [5, "minute"],
  "15m": [15, "minute"],
  "30m": [30, "minute"],
};

/** How far back Yahoo will serve each interval, in days. */
const YAHOO_LOOKBACK_DAYS = {
  "1m": 7,
  "2m": 59,
  "5m": 59,
  "15m": 59,
  "30m": 59,
  "60m": 730,
  "90m": 730,
  "1h": 730,
};
const DEFAULT_LOOKBACK_DAYS = 3650;

/** Plain equity tickers, optionally with a share class (BRK.B). Not ES=F or ^GSPC. */
const POLYGON_SYMBOL = /^[A-Z]{1,5}(\.[A-Z])?$/;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const sessionClock = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
});

/**
 * Whether a bar that starts at `date` starts inside the regular US equity
 * session (9:30 to 16:00 New York). Polygon returns pre-market and after-hours
 * bars too; Yahoo never did, and the datasets on disk are regular hours only,
 * so mixing the two would put overnight bars in the middle of a series.
 */
export function isRegularSession(date) {
  const parts = sessionClock.formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour").value);
  const minute = Number(parts.find((p) => p.type === "minute").value);
  const minutes = hour * 60 + minute;
  return minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}

/** Intervals whose datasets hold regular-session bars only. */
export const isSubHourInterval = (interval) => interval in POLYGON_SPANS;

/**
 * Whether a CSV row (Date,Open,High,Low,Close,Volume) is a placeholder rather
 * than a bar: no trades, and outside the regular session. Yahoo's 30m feed has
 * been emitting these overnight, some with an open, high and close near the
 * price and a low tens of points away, and a series that keeps them hands the
 * backtester stop-outs that never happened. An in-session bar with no volume is
 * a thin market, not a placeholder, so those are kept.
 */
export function isPlaceholderRow(line) {
  const [date, , , , , volume] = line.split(",");
  return Number(volume) === 0 && !isRegularSession(new Date(date));
}

/** Which source serves this symbol and interval, and why. */
export function pickSource(symbol, interval, apiKey = process.env.POLYGON_API_KEY) {
  if (!(interval in POLYGON_SPANS)) return { source: "yahoo" };
  if (!apiKey) {
    return { source: "yahoo", note: "POLYGON_API_KEY is not set — using Yahoo's short window" };
  }
  if (!POLYGON_SYMBOL.test(symbol)) {
    return { source: "yahoo", note: `${symbol} isn't a Polygon stock ticker — using Yahoo's short window` };
  }
  return { source: "polygon" };
}

/**
 * One GET against Polygon, retrying when it says to slow down. The key goes in
 * an Authorization header rather than the query string, so it can't turn up in
 * a logged URL or in the next_url Polygon hands back.
 */
async function polygonGet(url, apiKey, { retries = 6, baseWaitMs = 15000, log = () => {} } = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });

    if (res.status === 429 && attempt < retries) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const waitMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(baseWaitMs * 2 ** attempt, 60000);
      log(`Polygon rate limit hit, waiting ${Math.round(waitMs / 1000)}s (retry ${attempt + 1}/${retries})`);
      await sleep(waitMs);
      continue;
    }

    if (res.status === 401 || res.status === 403) {
      const detail = await res.json().catch(() => ({}));
      throw new Error(
        `Polygon rejected the request (HTTP ${res.status}): ${detail.message ?? detail.error ?? "check POLYGON_API_KEY and that your plan covers this data"}`,
      );
    }
    if (!res.ok) throw new Error(`Polygon request failed (HTTP ${res.status})`);
    return res.json();
  }
}

/** A gap this long at the end of a series is a truncated fetch, not a holiday. */
const MAX_TRAILING_GAP_DAYS = 10;

/**
 * Every bar between two dates, paged as far as Polygon has them.
 *
 * `from` and `to` should be YYYY-MM-DD dates. A millisecond `from` looks
 * equivalent but isn't: Polygon builds multi-minute bars starting at `from`, so
 * a `from` that isn't on a bar boundary shifts every bar in the response off
 * the :00/:30 grid.
 *
 * `limit` counts *base* 1-minute bars, not the bars asked for, so a 30-minute
 * request runs out of budget after about 1,800 bars — far short of the 50,000 —
 * and comes back with fewer results than the limit and a next_url. A short page
 * therefore does not mean the end; next_url does. (Following it is also what
 * keeps a year of 1-minute bars, roughly 240,000 with extended hours, to a
 * handful of requests instead of dozens of date-sliced ones.) A page that does
 * fill the limit without a next_url resumes just after its last bar. Bars are
 * keyed by timestamp, so a bar repeated at a page boundary can't double-count.
 *
 * Whatever the paging did, a series that stops well short of `to` is an error:
 * silently handing back part of a year is the one thing this must not do.
 */
export async function fetchPolygonBars(symbol, interval, from, to, options = {}) {
  const apiKey = options.apiKey ?? process.env.POLYGON_API_KEY;
  const pageLimit = options.pageLimit ?? POLYGON_PAGE_LIMIT;
  const delayMs = options.requestDelayMs ?? Number(process.env.POLYGON_REQUEST_DELAY_MS ?? 0);
  const [multiplier, timespan] = POLYGON_SPANS[interval];
  const spanMs = multiplier * 60 * 1000;

  const rangeUrl = (start) =>
    `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(symbol)}` +
    `/range/${multiplier}/${timespan}/${start}/${to}` +
    `?adjusted=true&sort=asc&limit=${pageLimit}`;

  const bars = new Map();
  let url = rangeUrl(from);
  let requests = 0;

  while (url) {
    const body = await polygonGet(url, apiKey, options);
    requests++;

    const results = body.results ?? [];
    for (const bar of results) bars.set(bar.t, bar);

    if (body.next_url) {
      url = body.next_url;
    } else if (results.length >= pageLimit) {
      url = rangeUrl(results[results.length - 1].t + spanMs);
    } else {
      url = null;
    }
    if (url && delayMs > 0) await sleep(delayMs);
  }

  const sorted = [...bars.values()].sort((a, b) => a.t - b.t);
  if (sorted.length > 0) {
    const end = typeof to === "number" ? to : Date.parse(`${to}T23:59:59Z`);
    const gapDays = (end - sorted[sorted.length - 1].t) / DAY_MS;
    if (gapDays > MAX_TRAILING_GAP_DAYS) {
      throw new Error(
        `Polygon returned ${symbol} ${interval} only up to ${new Date(sorted[sorted.length - 1].t).toISOString().slice(0, 10)}, ` +
          `${Math.round(gapDays)} days before ${to} — the fetch was cut short or the plan doesn't cover recent data`,
      );
    }
  }

  return { bars: sorted, requests };
}

/**
 * Bars for one symbol and interval, in the shape yahoo-finance2's chart()
 * returns quotes ({ date, open, high, low, close, volume }) so the scripts that
 * write CSVs don't care which source answered.
 *
 * Returns { quotes, source, days, requests, note? }. `days` is how far back the
 * request reached, so a caller can report what it actually got.
 */
export async function fetchQuotes(symbol, interval, options = {}) {
  const now = new Date();
  const choice = pickSource(symbol, interval, options.apiKey);

  if (choice.source === "polygon") {
    const day = (ms) => new Date(ms).toISOString().slice(0, 10);
    const { bars, requests } = await fetchPolygonBars(
      symbol,
      interval,
      day(now.getTime() - POLYGON_LOOKBACK_DAYS * DAY_MS),
      day(now.getTime()),
      options,
    );
    const quotes = bars
      .map((b) => ({ date: new Date(b.t), open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v }))
      .filter((q) => isRegularSession(q.date));
    if (quotes.length === 0) throw new Error("No data returned");
    return { quotes, source: "polygon", days: POLYGON_LOOKBACK_DAYS, requests };
  }

  const days = YAHOO_LOOKBACK_DAYS[interval] ?? DEFAULT_LOOKBACK_DAYS;
  const period1 = new Date(now.getTime() - days * DAY_MS);
  const result = await yahooFinance.chart(symbol, { period1, period2: now, interval });
  const quotes = result?.quotes ?? [];
  if (quotes.length === 0) throw new Error("No data returned");
  return { quotes, source: "yahoo", days, requests: 1, note: choice.note };
}
