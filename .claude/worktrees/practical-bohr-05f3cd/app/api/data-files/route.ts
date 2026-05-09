import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const dataDir = path.join(process.cwd(), "data");

    if (!fs.existsSync(dataDir)) {
      return NextResponse.json({
        success: true,
        files: [],
      });
    }

    const files = fs
      .readdirSync(dataDir)
      .filter((file) => file.endsWith(".csv"))
      .sort();

    // Parse file names to extract symbol and timeframe info
    const datasets = files.map((file) => {
      // Format: SYMBOL-TIMEFRAME-DATE.csv (e.g., SPY-1d-2026-02-01.csv)
      const nameWithoutExt = file.replace(".csv", "");
      const parts = nameWithoutExt.split("-");
      const symbol = parts[0];
      const timeframe = parts[1];
      const date = parts.slice(2).join("-");

      return {
        file,
        symbol,
        timeframe,
        date,
        label: `${symbol} ${timeframe.toUpperCase()}`,
      };
    });

    return NextResponse.json({
      success: true,
      files: datasets,
    });
  } catch (error) {
    console.error("Error listing data files:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to list data files",
      },
      { status: 500 },
    );
  }
}
