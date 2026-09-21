import fs from "fs";
import path from "path";
import { fetchQuotes } from "./lib/market-data.mjs";
import { DATA_DIR, writeManifest } from "./lib/data-manifest.mjs";

// Get command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
  console.error("Usage: npm run download-data <SYMBOL> <INTERVAL>");
  console.error("Example: npm run download-data SPY 5m");
  console.error("Supported intervals: 1m, 2m, 5m, 15m, 30m, 60m, 90m, 1h, 1d, 5d, 1wk, 1mo, 3mo");
  process.exit(1);
}

const symbol = args[0].toUpperCase();
const interval = args[1];

async function downloadData() {
  try {
    console.log(`Downloading data for ${symbol} with interval ${interval}...`);

    // Sub-hour intervals come from Polygon (a year); everything else keeps its
    // existing Yahoo window. See scripts/lib/market-data.mjs.
    const { quotes, source, days, requests, note } = await fetchQuotes(symbol, interval);
    if (note) console.warn(`Note: ${note}.`);
    console.log(`Retrieved ${quotes.length} records from ${source} (last ${days} days, ${requests} request${requests === 1 ? "" : "s"}).`);

    // Convert to CSV
    const header = "Date,Open,High,Low,Close,Volume\n";
    const csvContent = quotes
      .map((quote) => {
        // Ensure we have valid data points
        if (quote.open === null || quote.close === null) return "";

        return `${quote.date.toISOString()},${quote.open},${quote.high},${quote.low},${quote.close},${quote.volume}`;
      })
      .filter((row) => row !== "")
      .join("\n");

    const fullCsv = header + csvContent;

    // Ensure data directory exists
    const dataDir = DATA_DIR;
    fs.mkdirSync(dataDir, { recursive: true });

    // Generate filename
    const filename = `${symbol}-${interval}-${new Date().toISOString().split("T")[0]}.csv`;
    const filePath = path.join(dataDir, filename);

    fs.writeFileSync(filePath, fullCsv);
    writeManifest();

    console.log(`Success! Data saved to: ${filePath}`);
  } catch (error) {
    console.error("Error downloading data:", error.message);
    if (error.result) {
      console.error("API Response:", JSON.stringify(error.result, null, 2));
    }
    process.exit(1);
  }
}

downloadData();
