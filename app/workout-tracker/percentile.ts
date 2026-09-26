/**
 * Where a lift sits against the general adult male population.
 *
 * The table below is a banded strength-standards table supplied directly by
 * the user, not a cited or peer-reviewed dataset — and male-only, since
 * that's all it covers. Both of those need to stay visible wherever this is
 * shown, not just live here as a comment (see the caveat text in
 * WorkoutTrackerContent.tsx). Each row gives the 5x5 working weight, in lbs,
 * at the boundary of a percentile band — nine bands (below 5th, 5th-10th,
 * ..., 95th-99th, 99th+), eight boundaries. populationPercentile()
 * interpolates within a band so a progress bar can fill smoothly;
 * percentileBand() reports the band itself, because the table only has
 * nine bands of resolution and a single invented ordinal ("82nd
 * percentile") would claim precision it doesn't have.
 */

export type LiftGroup = "push" | "pull" | "legs";

/** [percentile, weightLbs] boundaries between one band and the next, ascending. */
type PercentileTable = [percentile: number, weightLbs: number][];

const MALE_5X5_PERCENTILES: Record<string, PercentileTable> = {
  "Bench Press": [
    [5, 65], [10, 80], [25, 105], [50, 125], [75, 155], [90, 190], [95, 210], [99, 245],
  ],
  "Overhead Press": [
    [5, 40], [10, 50], [25, 65], [50, 80], [75, 95], [90, 115], [95, 130], [99, 155],
  ],
  Squat: [
    [5, 60], [10, 80], [25, 115], [50, 145], [75, 190], [90, 230], [95, 265], [99, 325],
  ],
  Deadlift: [
    [5, 90], [10, 115], [25, 140], [50, 175], [75, 220], [90, 265], [95, 300], [99, 370],
  ],
  "Barbell Row": [
    [5, 60], [10, 70], [25, 90], [50, 110], [75, 135], [90, 165], [95, 185], [99, 215],
  ],
};

/** Deadlift is in both pull and legs: it's a pull off the floor that the legs drive. */
export const LIFT_GROUPS: { group: LiftGroup; title: string; blurb: string; lifts: string[] }[] = [
  {
    group: "push",
    title: "Push",
    blurb: "Push the weight away from your body until your arms lock: pushing something away or lifting it overhead.",
    lifts: ["Bench Press", "Overhead Press"],
  },
  {
    group: "pull",
    title: "Pull",
    blurb: "Pull the weight from the floor towards your body: pulling something heavy towards you or lifting it off the floor.",
    lifts: ["Deadlift", "Barbell Row"],
  },
  {
    group: "legs",
    title: "Legs",
    blurb: "Lift the weight with your legs until you stand with it: sitting down and coming back up without using your hands.",
    lifts: ["Squat", "Deadlift"],
  },
];

type BandLookup =
  | { kind: "below"; pct: number; weight: number }
  | { kind: "above"; pct: number }
  | { kind: "between"; p0: number; w0: number; p1: number; w1: number };

/** Where `weightLbs` falls in `lift`'s table, or null if the lift isn't in it. */
function findBand(lift: string, weightLbs: number): BandLookup | null {
  const table = MALE_5X5_PERCENTILES[lift];
  if (!table || !(weightLbs > 0)) return null;
  const [firstPct, firstLbs] = table[0];
  if (weightLbs < firstLbs) return { kind: "below", pct: firstPct, weight: firstLbs };
  const [lastPct, lastLbs] = table[table.length - 1];
  if (weightLbs >= lastLbs) return { kind: "above", pct: lastPct };
  for (let i = 0; i < table.length - 1; i++) {
    const [p0, w0] = table[i];
    const [p1, w1] = table[i + 1];
    if (weightLbs >= w0 && weightLbs < w1) return { kind: "between", p0, w0, p1, w1 };
  }
  return null; // unreachable — the table is exhaustive between its first and last points
}

/**
 * A continuous 0-100 estimate for `weightLbs` on `lift`, linearly
 * interpolated within its band — this drives a progress bar's fill width,
 * not something to print as a precise ordinal (see percentileBand() for
 * what to show a person). Below the table's lowest band this scales down
 * to 0 at 0 lbs; at or above its highest band it holds at that band's own
 * floor rather than extrapolating past data the table doesn't have. Null
 * when the lift isn't in the table or nothing's logged.
 */
export function populationPercentile(lift: string, weightLbs: number): number | null {
  const band = findBand(lift, weightLbs);
  if (!band) return null;
  if (band.kind === "below") return (weightLbs / band.weight) * band.pct;
  if (band.kind === "above") return band.pct;
  return band.p0 + ((weightLbs - band.w0) / (band.w1 - band.w0)) * (band.p1 - band.p0);
}

const ordinal = (n: number): string => {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
};

/**
 * The table's own band for `weightLbs` on `lift` — "75th–90th", "Below
 * 5th", "99th+" — rather than a single invented ordinal. Null when the
 * lift isn't in the table or nothing's logged.
 */
export function percentileBand(lift: string, weightLbs: number): string | null {
  const band = findBand(lift, weightLbs);
  if (!band) return null;
  if (band.kind === "below") return `Below ${ordinal(band.pct)}`;
  if (band.kind === "above") return `${ordinal(band.pct)}+`;
  return `${ordinal(band.p0)}–${ordinal(band.p1)}`;
}

/** Most recent entry per exercise by date; ties go to the heavier entry. */
export function latestWeights(logs: { exercise: string; date: string; weight?: number | null }[]): Map<string, { weight: number; date: string }> {
  const map = new Map<string, { weight: number; date: string }>();
  for (const l of logs) {
    const w = l.weight ?? 0;
    const prev = map.get(l.exercise);
    if (!prev || l.date > prev.date || (l.date === prev.date && w > prev.weight)) {
      map.set(l.exercise, { weight: w, date: l.date });
    }
  }
  return map;
}
