/**
 * Crime data analysis script for SPD Crime Density page.
 * Run with: node scripts/analyze-crime-data.mjs
 *
 * CSV columns (0-indexed):
 *  0  Report Number
 *  1  Report DateTime
 *  2  Offense ID
 *  3  Offense Date
 *  4  NIBRS Group AB
 *  5  NIBRS Crime Against Category
 *  6  Offense Sub Category
 *  7  Shooting Type Group
 *  8  Block Address
 *  9  Latitude
 * 10  Longitude
 * 11  Beat
 * 12  Precinct
 * 13  Sector
 * 14  Neighborhood
 * 15  Reporting Area
 * 16  Offense Category
 * 17  NIBRS Offense Code Description
 * 18  NIBRS_offense_code
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.join(__dirname, "../data/spd-crime-data.csv");

const raw = fs.readFileSync(csvPath, "utf-8");
const lines = raw.split("\n").filter((l) => l.trim().length > 0);

// --- CSV parser (handles quoted fields) ---
function parseLine(line) {
  const cols = [];
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

// ---- Accumulators ----
const counters = {
  category: {},        // col 16  Offense Category
  subCategory: {},     // col 6   Offense Sub Category
  nibrs: {},           // col 17  NIBRS Offense Code Description
  neighborhood: {},    // col 14  Neighborhood
  precinct: {},        // col 12  Precinct
  year: {},            // parsed from col 3  Offense Date
  hour: {},            // hour from col 3  Offense Date
  dayOfWeek: {},       // day-of-week from col 3
};
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

let total = 0;
let headerSkipped = false;

for (const line of lines) {
  if (!headerSkipped) { headerSkipped = true; continue; }

  const cols = parseLine(line);
  const category   = cols[16] ?? "UNKNOWN";
  const subCat     = cols[6]  ?? "UNKNOWN";
  const nibrs      = cols[17] ?? "UNKNOWN";
  const neighborhood = cols[14] ?? "UNKNOWN";
  const precinct   = cols[12] ?? "-";
  const offenseDateStr = cols[3] ?? "";

  // Parse offense date: "2026 Feb 12 06:00:00 PM"
  const offenseDate = new Date(offenseDateStr);
  const validDate = !isNaN(offenseDate.getTime());
  const year = validDate ? offenseDate.getFullYear() : null;
  const hour = validDate ? offenseDate.getHours() : null;
  const dow  = validDate ? offenseDate.getDay() : null;

  if (category === "ALL OTHER" || category === "UNKNOWN") {} // still count

  const inc = (map, key) => { if (key) map[key] = (map[key] ?? 0) + 1; };
  inc(counters.category, category);
  inc(counters.subCategory, subCat);
  inc(counters.nibrs, nibrs);
  inc(counters.neighborhood, neighborhood);
  if (precinct !== "-" && precinct !== "") inc(counters.precinct, precinct);
  if (year) inc(counters.year, year);
  if (hour !== null) inc(counters.hour, hour);
  if (dow !== null) inc(counters.dayOfWeek, DAYS[dow]);

  total++;
}

// ---- Helpers ----
const top = (map, n = 10) =>
  Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, count]) => ({ name, count }));

const sorted = (map, keyTransform = (k) => k) =>
  Object.entries(map)
    .sort((a, b) => keyTransform(a[0]) - keyTransform(b[0]))
    .map(([k, v]) => ({ key: keyTransform(k), count: v }));

console.log(`\n===== SPD Crime Data Analysis =====`);
console.log(`Total records: ${total.toLocaleString()}\n`);

console.log(`--- Top 15 Offense Categories ---`);
top(counters.category, 15).forEach(({ name, count }) =>
  console.log(`  ${name.padEnd(55)} ${count.toLocaleString()}`)
);

console.log(`\n--- Top 15 Offense Sub-Categories ---`);
top(counters.subCategory, 15).forEach(({ name, count }) =>
  console.log(`  ${name.padEnd(55)} ${count.toLocaleString()}`)
);

console.log(`\n--- Top 15 NIBRS Crime Types ---`);
top(counters.nibrs, 15).forEach(({ name, count }) =>
  console.log(`  ${name.padEnd(55)} ${count.toLocaleString()}`)
);

console.log(`\n--- Top 20 Neighborhoods ---`);
top(counters.neighborhood, 20).forEach(({ name, count }) =>
  console.log(`  ${name.padEnd(40)} ${count.toLocaleString()}`)
);

console.log(`\n--- Incidents by Precinct ---`);
top(counters.precinct, 10).forEach(({ name, count }) =>
  console.log(`  ${name.padEnd(20)} ${count.toLocaleString()}`)
);

console.log(`\n--- Incidents by Year ---`);
sorted(counters.year, Number).forEach(({ key, count }) =>
  console.log(`  ${key}  ${count.toLocaleString()}`)
);

console.log(`\n--- Incidents by Hour of Day ---`);
for (let h = 0; h < 24; h++) {
  const c = counters.hour[h] ?? 0;
  const bar = "█".repeat(Math.round(c / (total / 24 / 2)));
  console.log(`  ${String(h).padStart(2, "0")}:00  ${bar.padEnd(30)} ${c.toLocaleString()}`);
}

console.log(`\n--- Incidents by Day of Week ---`);
DAYS.forEach((d) => {
  const c = counters.dayOfWeek[d] ?? 0;
  console.log(`  ${d}  ${c.toLocaleString()}`);
});
