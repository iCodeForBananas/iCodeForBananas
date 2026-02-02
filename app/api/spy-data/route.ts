import { NextResponse, NextRequest } from "next/server";
import fs from "fs";
import path from "path";

// Disable caching for API routes that fetch dynamic data
export const dynamic = "force-dynamic";

// Supported timeframes
const VALID_TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "1d"];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const timeframe = searchParams.get("timeframe") || "5m";
    const smaPeriod = parseInt(searchParams.get("smaPeriod") || "20", 10);

    // Validate timeframe
    if (!VALID_TIMEFRAMES.includes(timeframe)) {
      throw new Error(`Invalid timeframe. Supported: ${VALID_TIMEFRAMES.join(", ")}`);
    }

    // Validate smaPeriod
    if (isNaN(smaPeriod) || smaPeriod < 5 || smaPeriod > 200) {
      throw new Error("Invalid smaPeriod. Must be between 5 and 200.");
    }

    const dataDir = path.join(process.cwd(), "data");

    // Check if data directory exists
    if (!fs.existsSync(dataDir)) {
      throw new Error('Data directory not found. Please run "npm run download-data SPY 5m" first.');
    }

    // Find the latest SPY-{timeframe}-*.csv file
    const files = fs.readdirSync(dataDir);
    const spyFile = files
      .filter((file) => file.startsWith(`SPY-${timeframe}-`) && file.endsWith(".csv"))
      .sort()
      .reverse()[0]; // Get the last one alphabetically (which usually corresponds to latest date)

    if (!spyFile) {
      throw new Error(`No SPY ${timeframe} data found. Please run "npm run download-data SPY ${timeframe}" first.`);
    }

    const filePath = path.join(dataDir, spyFile);
    const csvText = fs.readFileSync(filePath, "utf-8");

    // Parse CSV
    const lines = csvText.trim().split("\n");
    lines.shift(); // Remove header

    const parsedData = lines
      .map((line) => {
        const values = line.split(",");
        if (values.length < 5) return null;
        return {
          // Date format in CSV is ISO string (from download script)
          time: new Date(values[0]).getTime(),
          open: parseFloat(values[1]),
          high: parseFloat(values[2]),
          low: parseFloat(values[3]),
          close: parseFloat(values[4]),
        };
      })
      .filter(
        (candle): candle is NonNullable<typeof candle> =>
          candle !== null && !isNaN(candle.time) && !isNaN(candle.close),
      )
      .sort((a, b) => a.time - b.time);

    // Calculate SMAs
    const calculateSMA = (data: typeof parsedData, period: number, index: number): number | undefined => {
      if (index < period - 1) return undefined;
      const sum = data.slice(index - period + 1, index + 1).reduce((acc, candle) => acc + candle.close, 0);
      return sum / period;
    };

    const priceData = parsedData.map((candle, index) => ({
      ...candle,
      trailstopSma: calculateSMA(parsedData, smaPeriod, index),
    }));

    return NextResponse.json({
      success: true,
      data: priceData,
      count: priceData.length,
      source: spyFile,
    });
  } catch (error) {
    console.error("Data loading error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to load SPY data",
      },
      { status: 500 },
    );
  }
}
