import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

interface CrimePoint {
  lat: number;
  lng: number;
  year: number;
  ts: number;
}

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "data", "spd-crime-data.csv");

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: "Crime data file not found" },
        { status: 404 }
      );
    }

    const raw = fs.readFileSync(filePath, "utf-8");
    const lines = raw.split("\n").filter((line) => line.trim().length > 0);

    const points: CrimePoint[] = [];

    for (const line of lines) {
      // Parse CSV respecting quoted fields
      const cols: string[] = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          inQuotes = !inQuotes;
        } else if (ch === "," && !inQuotes) {
          cols.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
      cols.push(current.trim());

      // Col 1: report datetime (e.g. "2008 Jan 02 10:14:00 PM")
      // Col 9: latitude
      // Col 10: longitude
      const dateStr = cols[1] ?? "";
      const latStr = cols[9] ?? "";
      const lngStr = cols[10] ?? "";

      const lat = parseFloat(latStr);
      const lng = parseFloat(lngStr);

      // Extract year from date string
      const yearMatch = dateStr.match(/^(\d{4})\b/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : NaN;

      // Parse full date for sorting
      const ts = new Date(dateStr).getTime();

      // Filter out invalid / redacted coordinates
      if (
        !isNaN(lat) &&
        !isNaN(lng) &&
        !isNaN(year) &&
        lat > 0 &&
        lng < 0
      ) {
        points.push({ lat, lng, year, ts: isNaN(ts) ? 0 : ts });
      }
    }

    // Sort by date descending (most recent first)
    points.sort((a, b) => b.ts - a.ts);

    // Determine year range
    const years = points.map((p) => p.year);
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);

    return NextResponse.json({ points, minYear, maxYear });
  } catch (err) {
    console.error("Error reading crime data:", err);
    return NextResponse.json(
      { error: "Failed to read crime data" },
      { status: 500 }
    );
  }
}
