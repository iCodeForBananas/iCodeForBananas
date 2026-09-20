/**
 * Top an existing dataset up with whatever the source will still serve, and
 * keep the bars it no longer will.
 *
 * download-data.mjs overwrites: it fetches one window and writes a new file.
 * For intraday that loses history for good, because Yahoo only serves the last
 * 60 days of 30m (and 8 of 1m) — bars older than that can't be fetched again
 * from anywhere. So this merges the fetched window into the CSV already on
 * disk, keyed by bar timestamp, and renames it to today's date. Run it
 * regularly and a 30m series grows past the 60-day window one refresh at a
 * time; skip a few months and the series has a hole where nothing was kept.
 *
 *   node scripts/refresh-data.mjs 30m              # every ticker, 30m
 *   node scripts/refresh-data.mjs 30m TQQQ SPY     # just these
 *   node scripts/refresh-data.mjs 30m --all        # every ticker/interval pair on disk
 */

import YahooFinance from "yahoo-finance2";
import fs from "fs";
import path from "path";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const DELAY_MS = 1500;

/** How far back the source will serve each interval, in days. */
const LOOKBACK_DAYS = {
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

const args = process.argv.slice(2);
const interval = args.find((a) => !a.startsWith("--"));
const symbols = args.filter((a) => !a.startsWith("--") && a !== interval).map((s) => s.toUpperCase());

if (!interval) {
  console.error("Usage: node scripts/refresh-data.mjs <INTERVAL> [SYMBOL...]");
  console.error("Example: node scripts/refresh-data.mjs 30m TQQQ");
  process.exit(1);
}

const dataDir = path.join(process.cwd(), "data");

/** Existing files for this interval, as { symbol, file }. */
function existingFor(interval, symbols) {
  const found = new Map();
  for (const file of fs.readdirSync(dataDir)) {
    if (!file.endsWith(".csv")) continue;
    const parts = file.replace(".csv", "").split("-");
    // Futures tickers carry an '=' but never a '-', so parts[0] is the symbol.
    if (parts[1] !== interval) continue;
    if (symbols.length > 0 && !symbols.includes(parts[0])) continue;
    found.set(parts[0], file);
  }
  return found;
}

/** CSV rows as a Map of ISO timestamp → full line, so a merge dedupes by bar. */
function readRows(file) {
  const rows = new Map();
  if (!file) return rows;
  const text = fs.readFileSync(path.join(dataDir, file), "utf8").trim();
  for (const line of text.split("\n").slice(1)) {
    const date = line.split(",")[0];
    if (date) rows.set(date, line.trim());
  }
  return rows;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function refreshOne(symbol, existingFile) {
  const lookback = LOOKBACK_DAYS[interval] ?? DEFAULT_LOOKBACK_DAYS;
  const period2 = new Date();
  const period1 = new Date(period2.getTime() - lookback * 24 * 60 * 60 * 1000);

  const result = await yahooFinance.chart(symbol, { period1, period2, interval });
  const quotes = result?.quotes ?? [];
  if (quotes.length === 0) throw new Error("No data returned");

  const rows = readRows(existingFile);
  const before = rows.size;
  for (const q of quotes) {
    if (q.open === null || q.close === null) continue;
    rows.set(q.date.toISOString(), `${q.date.toISOString()},${q.open},${q.high},${q.low},${q.close},${q.volume}`);
  }

  const sorted = [...rows.entries()].sort((a, b) => new Date(a[0]) - new Date(b[0])).map(([, line]) => line);
  const filename = `${symbol}-${interval}-${new Date().toISOString().split("T")[0]}.csv`;
  fs.writeFileSync(path.join(dataDir, filename), `Date,Open,High,Low,Close,Volume\n${sorted.join("\n")}\n`);
  if (existingFile && existingFile !== filename) fs.unlinkSync(path.join(dataDir, existingFile));

  return {
    added: rows.size - before,
    total: rows.size,
    from: sorted[0].split(",")[0].slice(0, 10),
    to: sorted[sorted.length - 1].split(",")[0].slice(0, 10),
    filename,
  };
}

async function main() {
  const existing = existingFor(interval, symbols);
  // A symbol asked for by name gets fetched even with nothing on disk yet.
  for (const symbol of symbols) if (!existing.has(symbol)) existing.set(symbol, null);

  if (existing.size === 0) {
    console.log(`Nothing to refresh: no ${interval} files on disk and no symbols given.`);
    return;
  }

  console.log(`Refreshing ${existing.size} ${interval} dataset(s)...\n`);
  let ok = 0;
  let failed = 0;
  for (const [symbol, file] of existing) {
    process.stdout.write(`${symbol} ${interval} ... `);
    try {
      const r = await refreshOne(symbol, file);
      console.log(`+${r.added} bars, ${r.total} total, ${r.from} → ${r.to}`);
      ok++;
    } catch (err) {
      console.log(`FAILED: ${err.message.slice(0, 120)}`);
      failed++;
    }
    await sleep(DELAY_MS);
  }
  console.log(`\nDone. ${ok} refreshed, ${failed} failed.`);
}

main();
