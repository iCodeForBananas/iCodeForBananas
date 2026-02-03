import { NextResponse, NextRequest } from "next/server";
import fs from "fs";
import path from "path";

// Disable caching for API routes that fetch dynamic data
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fileParam = searchParams.get("file");
    const donchianPeriod = parseInt(searchParams.get("donchianPeriod") || "10", 10);

    // Validate donchianPeriod
    if (isNaN(donchianPeriod) || donchianPeriod < 5 || donchianPeriod > 200) {
      throw new Error("Invalid donchianPeriod. Must be between 5 and 200.");
    }

    const dataDir = path.join(process.cwd(), "data");

    // Check if data directory exists
    if (!fs.existsSync(dataDir)) {
      throw new Error('Data directory not found. Please run "npm run download-data SPY 5m" first.');
    }

    let targetFile: string;

    if (fileParam) {
      // Use the specified file
      targetFile = fileParam;
      if (!fs.existsSync(path.join(dataDir, targetFile))) {
        throw new Error(`File "${targetFile}" not found in data directory.`);
      }
    } else {
      // Default: find any available CSV file
      const files = fs
        .readdirSync(dataDir)
        .filter((file) => file.endsWith(".csv"))
        .sort();
      if (files.length === 0) {
        throw new Error('No data files found. Please run "npm run download-data SPY 5m" first.');
      }
      targetFile = files[0];
    }

    const filePath = path.join(dataDir, targetFile);
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

    // Calculate Donchian Channel middle line (highest high + lowest low) / 2
    const calculateDonchianMiddle = (data: typeof parsedData, period: number, index: number): number | undefined => {
      if (index < period - 1) return undefined;
      const slice = data.slice(index - period + 1, index + 1);
      const highestHigh = Math.max(...slice.map((c) => c.high));
      const lowestLow = Math.min(...slice.map((c) => c.low));
      return (highestHigh + lowestLow) / 2;
    };

    const priceData = parsedData.map((candle, index) => ({
      ...candle,
      donchianMiddle: calculateDonchianMiddle(parsedData, donchianPeriod, index),
    }));

    return NextResponse.json({
      success: true,
      data: priceData,
      count: priceData.length,
      source: targetFile,
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
