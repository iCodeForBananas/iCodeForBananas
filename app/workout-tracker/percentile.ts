/**
 * Where a lift sits against the general adult population, as a percentile.
 *
 * Strength relative to bodyweight is roughly log-normal across the population
 * (a long right tail of people who train), so each lift is modelled as a
 * log-normal over the weight / bodyweight ratio. The medians are for adults at
 * large, most of whom don't train, not for gym-goers; they are estimates, not
 * a published table, and put the old Novice/Intermediate/Advanced ratios at
 * roughly the 65th/95th/99.5th percentile.
 */

export type LiftGroup = "push" | "pull" | "legs";

export interface PopulationLift {
  name: string;
  /** Median weight / bodyweight across the general population. */
  median: number;
  /** Spread of ln(weight / bodyweight). */
  sigma: number;
}

export const POPULATION_LIFTS: Record<string, PopulationLift> = {
  "Bench Press": { name: "Bench Press", median: 0.65, sigma: 0.35 },
  "Overhead Press": { name: "Overhead Press", median: 0.45, sigma: 0.35 },
  Deadlift: { name: "Deadlift", median: 1.1, sigma: 0.35 },
  "Barbell Row": { name: "Barbell Row", median: 0.6, sigma: 0.35 },
  Squat: { name: "Squat", median: 0.9, sigma: 0.35 },
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

/** Standard normal CDF (Abramowitz and Stegun 7.1.26, error below 1.5e-7). */
export function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/**
 * Percentile (0 to 100) of `weightLbs` for `lift` at `bodyweightLbs`, or null
 * when the lift isn't modelled or there's nothing to compare.
 */
export function populationPercentile(lift: string, weightLbs: number, bodyweightLbs: number): number | null {
  const model = POPULATION_LIFTS[lift];
  if (!model || !(weightLbs > 0) || !(bodyweightLbs > 0)) return null;
  const z = Math.log(weightLbs / bodyweightLbs / model.median) / model.sigma;
  return normalCdf(z) * 100;
}

/** "63rd", "99.4th": whole numbers until the top 1%, where a decimal still separates people. */
export function formatPercentile(p: number): string {
  if (p >= 99 && p < 100) {
    const d = Math.min(99.9, Math.floor(p * 10) / 10);
    return `${d}th`;
  }
  const n = Math.max(1, Math.min(99, Math.round(p)));
  const mod100 = n % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
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
