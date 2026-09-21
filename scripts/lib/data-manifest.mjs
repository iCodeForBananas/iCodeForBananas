/**
 * Where the backtester's datasets live, and the list of them the page reads.
 *
 * The CSVs sit in public/data so Vercel serves them as static assets from its
 * CDN. They used to be read by an API route out of a bundled data/ folder, which
 * cannot carry a year of 1-minute bars: those files are about 6 MB each against
 * a 4.5 MB response cap on functions, and the whole folder is past 240 MB
 * against a 250 MB function bundle limit.
 *
 * A static folder can't be listed at request time, so the listing is written
 * out as public/data/manifest.json instead — by every script that changes what
 * is on disk, and by `npm run data:manifest` (which the build runs, so a
 * dataset added by hand still shows up).
 */

import fs from "node:fs";
import path from "node:path";

export const DATA_DIR = path.join(process.cwd(), "public", "data");

/** SYMBOL-INTERVAL-DATE.csv → { file, symbol, timeframe, date, label }. */
export function describeDataset(file) {
  // Futures tickers carry an '=' but never a '-', so the first part is the symbol.
  const [symbol, timeframe, ...rest] = file.replace(/\.csv$/, "").split("-");
  return { file, symbol, timeframe, date: rest.join("-"), label: `${symbol} ${timeframe.toUpperCase()}` };
}

/** Rewrites public/data/manifest.json from the CSVs currently on disk. */
export function writeManifest(dataDir = DATA_DIR) {
  fs.mkdirSync(dataDir, { recursive: true });
  const files = fs
    .readdirSync(dataDir)
    .filter((file) => file.endsWith(".csv"))
    .sort()
    .map(describeDataset);
  fs.writeFileSync(path.join(dataDir, "manifest.json"), `${JSON.stringify({ files }, null, 1)}\n`);
  return files.length;
}
