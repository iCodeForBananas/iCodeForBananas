import YahooFinance from "yahoo-finance2";
import fs from "fs";
import path from "path";

const yahooFinance = new YahooFinance();

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

    let startDate = new Date();
    const endDate = new Date();

    // Determine start date based on interval
    // Yahoo Finance limits vary by interval type
    const veryShortIntervals = ["1m"]; // 8 days max
    const shortIntradayIntervals = ["2m", "5m", "15m", "30m"]; // 59 days max
    const longIntradayIntervals = ["60m", "90m", "1h"]; // 730 days max

    if (veryShortIntervals.includes(interval)) {
      console.log("1m interval detected. Limiting fetch to last 7 days (Yahoo Finance limit).");
      startDate.setDate(startDate.getDate() - 7);
    } else if (shortIntradayIntervals.includes(interval)) {
      console.log("Short intraday interval detected. Limiting fetch to last 59 days (Yahoo Finance limit).");
      startDate.setDate(startDate.getDate() - 59);
    } else if (longIntradayIntervals.includes(interval)) {
      console.log("Hourly interval detected. Limiting fetch to last 730 days (Yahoo Finance limit).");
      startDate.setDate(startDate.getDate() - 730);
    } else {
      // For daily or longer, fetch 10 years
      console.log("Daily/Weekly/Monthly interval detected. Fetching last 10 years.");
      startDate.setFullYear(startDate.getFullYear() - 10);
    }

    const queryOptions = {
      period1: startDate,
      period2: endDate,
      interval: interval,
    };

    const result = await yahooFinance.chart(symbol, queryOptions);

    if (!result || !result.quotes || result.quotes.length === 0) {
      throw new Error("No data found for the given parameters.");
    }

    const quotes = result.quotes;
    console.log(`Retrieved ${quotes.length} records.`);

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
    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir);
    }

    // Generate filename
    const filename = `${symbol}-${interval}-${new Date().toISOString().split("T")[0]}.csv`;
    const filePath = path.join(dataDir, filename);

    fs.writeFileSync(filePath, fullCsv);

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
