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

interface StatEntry {
  name: string;
  count: number;
}

interface HourEntry {
  hour: number;
  label: string;
  count: number;
}

interface DowEntry {
  day: string;
  count: number;
}

interface YearEntry {
  year: number;
  count: number;
}

interface CrimeStats {
  total: number;
  byCategory: StatEntry[];
  bySubCategory: StatEntry[];
  byNIBRS: StatEntry[];
  byNeighborhood: StatEntry[];
  byPrecinct: StatEntry[];
  byYear: YearEntry[];
  byHour: HourEntry[];
  byDayOfWeek: DowEntry[];
}

// CSV parser handling quoted fields
function parseLine(line: string): string[] {
  const cols: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; }
    else if (ch === "," && !inQ) { cols.push(cur.trim()); cur = ""; }
    else { cur += ch; }
  }
  cols.push(cur.trim());
  return cols;
}

// Parse SPD date strings like "2026 Feb 12 06:00:00 PM"
function parseSPDDate(s: string): Date | null {
  if (!s) return null;
  // Replace 12-hour format for reliable parsing
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

const inc = (map: Record<string, number>, key: string | null | undefined) => {
  if (key && key.trim() && key !== "-") map[key] = (map[key] ?? 0) + 1;
};

const top = (map: Record<string, number>, n = 10): StatEntry[] =>
  Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, count]) => ({ name, count }));

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "data", "spd-crime-data.csv");

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "Crime data file not found" }, { status: 404 });
    }

    const raw = fs.readFileSync(filePath, "utf-8");
    const lines = raw.split("\n").filter((line) => line.trim().length > 0);

    const points: CrimePoint[] = [];

    // Stats accumulators
    const catMap: Record<string, number> = {};
    const subCatMap: Record<string, number> = {};
    const nibrsMap: Record<string, number> = {};
    const neighborhoodMap: Record<string, number> = {};
    const precinctMap: Record<string, number> = {};
    const yearMap: Record<string, number> = {};
    const hourMap: Record<number, number> = {};
    const dowMap: Record<string, number> = {};

    let total = 0;
    let headerSkipped = false;

    for (const line of lines) {
      if (!headerSkipped) { headerSkipped = true; continue; }

      const cols = parseLine(line);

      // CSV columns:
      // 1  Report DateTime
      // 3  Offense Date
      // 6  Offense Sub Category
      // 9  Latitude
      // 10 Longitude
      // 12 Precinct
      // 14 Neighborhood
      // 16 Offense Category
      // 17 NIBRS Offense Code Description

      const reportDateStr = cols[1] ?? "";
      const offenseDateStr = cols[3] ?? "";
      const subCategory = cols[6] ?? "UNKNOWN";
      const latStr = cols[9] ?? "";
      const lngStr = cols[10] ?? "";
      const precinct = cols[12] ?? "";
      const neighborhood = cols[14] ?? "UNKNOWN";
      const category = cols[16] ?? "UNKNOWN";
      const nibrs = cols[17] ?? "UNKNOWN";

      const lat = parseFloat(latStr);
      const lng = parseFloat(lngStr);

      // Report date for map points (sorting)
      const reportDate = parseSPDDate(reportDateStr);
      const ts = reportDate ? reportDate.getTime() : 0;

      // Extract year from report date string
      const yearMatch = reportDateStr.match(/^(\d{4})\b/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : NaN;

      // Offense date for temporal stats
      const offenseDate = parseSPDDate(offenseDateStr);

      // Accumulate stats
      const cleanNeighborhood = neighborhood === "UNKNOWN" || neighborhood === "-" ? null : neighborhood;
      const cleanPrecinct = precinct === "-" || precinct === "" ? null : precinct;
      const cleanSubCat = subCategory === "999" ? "Not Reportable" : subCategory;
      const cleanCategory =
        category === "ALL OTHER" ? "Other" :
        category === "NOT_A_CRIME" ? "Not a Crime" :
        category;

      inc(catMap, cleanCategory);
      inc(subCatMap, cleanSubCat);
      inc(nibrsMap, nibrs === "Not Reportable to NIBRS" ? "Not Reportable" : nibrs);
      if (cleanNeighborhood) inc(neighborhoodMap, cleanNeighborhood);
      if (cleanPrecinct) inc(precinctMap, cleanPrecinct);
      if (!isNaN(year) && year >= 2020) inc(yearMap, String(year));

      if (offenseDate) {
        const h = offenseDate.getHours();
        const dow = offenseDate.getDay();
        hourMap[h] = (hourMap[h] ?? 0) + 1;
        const dayName = DAYS[dow];
        dowMap[dayName] = (dowMap[dayName] ?? 0) + 1;
      }

      total++;

      // Map points: valid coords only
      if (!isNaN(lat) && !isNaN(lng) && !isNaN(year) && lat > 0 && lng < 0) {
        points.push({ lat, lng, year, ts });
      }
    }

    // Sort map points by date descending
    points.sort((a, b) => b.ts - a.ts);

    // Build hour series (0-23)
    const byHour: HourEntry[] = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      label: h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`,
      count: hourMap[h] ?? 0,
    }));

    // Build day-of-week series
    const byDayOfWeek: DowEntry[] = DAYS.map((day) => ({ day, count: dowMap[day] ?? 0 }));

    // Build year series (sorted)
    const byYear: YearEntry[] = Object.entries(yearMap)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([year, count]) => ({ year: Number(year), count }));

    const stats: CrimeStats = {
      total,
      byCategory: top(catMap, 10),
      bySubCategory: top(subCatMap, 12),
      byNIBRS: top(nibrsMap, 10),
      byNeighborhood: top(neighborhoodMap, 15),
      byPrecinct: top(precinctMap, 10),
      byYear,
      byHour,
      byDayOfWeek,
    };

    const years = points.map((p) => p.year);
    const minYear = years.length ? Math.min(...years) : 2020;
    const maxYear = years.length ? Math.max(...years) : new Date().getFullYear();

    return NextResponse.json({ points, minYear, maxYear, stats });
  } catch (err) {
    console.error("Error reading crime data:", err);
    return NextResponse.json({ error: "Failed to read crime data" }, { status: 500 });
  }
}
