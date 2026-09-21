import fs from "fs";
import path from "path";
import { fetchQuotes } from "./lib/market-data.mjs";
import { DATA_DIR, writeManifest } from "./lib/data-manifest.mjs";

const TICKERS = [
  "AAPL", "AMZN", "AVGO", "COST", "CSCO", "GOOGL", "LIN", "META",
  "MSFT", "MU", "NVDA", "PEP", "PLTR", "TMUS", "TQQQ", "TSLA",
  "TXN", "WMT", "ES=F", "NQ=F", "SPY", "QQQ",
];

const INTERVALS = ["1m", "2m", "5m", "15m", "30m", "1h", "1d", "1wk"];

const DELAY_MS = 1500;

function hasExistingFile(dataDir, symbol, interval) {
  const files = fs.readdirSync(dataDir);
  const prefix = `${symbol}-${interval}-`;
  return files.some((f) => f.startsWith(prefix) && f.endsWith(".csv"));
}

async function downloadOne(symbol, interval, dataDir) {
  const { quotes, note } = await fetchQuotes(symbol, interval);
  if (note) console.warn(`(${note}) `);

  const header = "Date,Open,High,Low,Close,Volume\n";
  const csvContent = quotes
    .map((q) => {
      if (q.open === null || q.close === null) return "";
      return `${q.date.toISOString()},${q.open},${q.high},${q.low},${q.close},${q.volume}`;
    })
    .filter(Boolean)
    .join("\n");

  const filename = `${symbol}-${interval}-${new Date().toISOString().split("T")[0]}.csv`;
  fs.writeFileSync(path.join(dataDir, filename), header + csvContent);
  return quotes.length;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const dataDir = DATA_DIR;
  fs.mkdirSync(dataDir, { recursive: true });

  const tasks = [];
  for (const symbol of TICKERS) {
    for (const interval of INTERVALS) {
      if (!hasExistingFile(dataDir, symbol, interval)) {
        tasks.push({ symbol, interval });
      }
    }
  }

  if (tasks.length === 0) {
    console.log("All data already present — nothing to download.");
    return;
  }

  console.log(`Downloading ${tasks.length} missing ticker/interval combinations...\n`);

  let done = 0;
  let failed = 0;

  for (const { symbol, interval } of tasks) {
    process.stdout.write(`[${done + failed + 1}/${tasks.length}] ${symbol} ${interval} ... `);
    try {
      const rows = await downloadOne(symbol, interval, dataDir);
      console.log(`OK (${rows} rows)`);
      done++;
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      failed++;
    }
    if (done + failed < tasks.length) await sleep(DELAY_MS);
  }

  writeManifest();
  console.log(`\nDone. ${done} downloaded, ${failed} failed.`);
}

main();
