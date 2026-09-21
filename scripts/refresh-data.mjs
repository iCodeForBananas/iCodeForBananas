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
 * With POLYGON_API_KEY set (in the environment or .env.local), sub-hour
 * intervals fetch a full year from Polygon instead of Yahoo's 7/59 days, so a
 * first refresh backfills the year and later ones just top it up. See
 * scripts/lib/market-data.mjs.
 *
 *   node scripts/refresh-data.mjs 30m              # every ticker, 30m
 *   node scripts/refresh-data.mjs 30m TQQQ SPY     # just these
 *   node scripts/refresh-data.mjs 30m --all        # every ticker/interval pair on disk
 */

import fs from "fs";
import path from "path";
import { fetchQuotes, isPlaceholderRow, isSubHourInterval } from "./lib/market-data.mjs";
import { DATA_DIR, writeManifest } from "./lib/data-manifest.mjs";

const DELAY_MS = 1500;

const args = process.argv.slice(2);
const interval = args.find((a) => !a.startsWith("--"));
const symbols = args.filter((a) => !a.startsWith("--") && a !== interval).map((s) => s.toUpperCase());

if (!interval) {
  console.error("Usage: node scripts/refresh-data.mjs <INTERVAL> [SYMBOL...]");
  console.error("Example: node scripts/refresh-data.mjs 30m TQQQ");
  process.exit(1);
}

const dataDir = DATA_DIR;

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

/**
 * CSV rows as a Map of ISO timestamp → full line, so a merge dedupes by bar.
 * For sub-hour intervals, off-session zero-volume placeholders are left behind
 * rather than carried forward; `dropped` says how many.
 */
function readRows(file) {
  const rows = new Map();
  let dropped = 0;
  if (!file) return { rows, dropped };
  const text = fs.readFileSync(path.join(dataDir, file), "utf8").trim();
  for (const raw of text.split("\n").slice(1)) {
    const line = raw.trim();
    const date = line.split(",")[0];
    if (!date) continue;
    if (isSubHourInterval(interval) && isPlaceholderRow(line)) {
      dropped++;
      continue;
    }
    rows.set(date, line);
  }
  return { rows, dropped };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function refreshOne(symbol, existingFile) {
  const { quotes, source, note } = await fetchQuotes(symbol, interval);

  const { rows, dropped } = readRows(existingFile);
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
    source,
    note,
    dropped,
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
      console.log(`+${r.added} bars, ${r.total} total, ${r.from} → ${r.to} (${r.source}${r.note ? `; ${r.note}` : ""}${r.dropped ? `; dropped ${r.dropped} off-session placeholder bars` : ""})`);
      ok++;
    } catch (err) {
      console.log(`FAILED: ${err.message.slice(0, 120)}`);
      failed++;
    }
    await sleep(DELAY_MS);
  }
  writeManifest();
  console.log(`\nDone. ${ok} refreshed, ${failed} failed.`);
}

main();
