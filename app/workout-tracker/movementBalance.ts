// Push / pull / legs balance.
//
// Tracking chest/back/shoulders separately said what got worked but not what it
// cost: a back day and a pull-up day are the same elbows and the same lats, and
// counting them apart hides the repeat. Movement patterns are what actually
// need the rest, so overuse shows up as a lopsided count here rather than as a
// sore joint later.

export const MOVEMENTS = ["push", "pull", "legs"] as const;
export type Movement = (typeof MOVEMENTS)[number];

/** Sessions of the same pattern closer than this are not a rest. */
export const REST_DAYS = 2;
/** How far back the counts look. */
export const WINDOW_DAYS = 14;
/** How far ahead the most-trained pattern has to be before it counts as lopsided. */
export const IMBALANCE_GAP = 2;

export const MOVEMENT_MAP: Partial<Record<string, Movement[]>> = {
  "Bench Press": ["push"],
  "Bent Over Rows": ["pull"],
  "Bulgarian Split Squats": ["legs"],
  // A deadlift is a hinge: the pulling chain moves the bar, the legs drive it.
  Deadlift: ["pull", "legs"],
  "Overhead Press": ["push"],
  "Pull-ups": ["pull"],
  "Push-ups": ["push"],
  Squat: ["legs"],
};

export const MOVEMENT_COLORS: Record<Movement, string> = {
  push: "#ef4444",
  pull: "#22c55e",
  legs: "#3b82f6",
};

export const MOVEMENT_EXERCISES = (Object.entries(MOVEMENT_MAP) as [string, Movement[]][]).reduce(
  (acc, [exercise, movements]) => {
    movements.forEach((m) => acc[m].push(exercise));
    return acc;
  },
  { push: [], pull: [], legs: [] } as Record<Movement, string[]>,
);

export const movementsFor = (exercise: string): Movement[] => MOVEMENT_MAP[exercise] ?? [];

export interface MovementEntry {
  exercise: string;
  date: string;
}

export interface MovementLoad {
  movement: Movement;
  /** Distinct days this pattern was trained inside the window. */
  days: number;
  /** Those days, oldest first. */
  dates: string[];
  /** Whole days since the last session, or null if it has never been trained. */
  daysSinceLast: number | null;
  /** True when the pattern is recovered enough to train again. */
  rested: boolean;
  /** Longest run of back-to-back days inside the window. */
  streak: number;
}

export interface BalanceReport {
  loads: MovementLoad[];
  /** Most-trained pattern, when it leads the least-trained by IMBALANCE_GAP or more. */
  overworked: Movement | null;
  /** How far ahead that pattern is. */
  gap: number;
  /** What to train next: the least-trained pattern that has had its rest. */
  nextUp: Movement | null;
}

const DAY_MS = 86400000;
const at = (date: string) => new Date(date + "T12:00:00").getTime();

const daysBetween = (from: string, to: string) => Math.round((at(to) - at(from)) / DAY_MS);

const shift = (date: string, days: number) => {
  const d = new Date(at(date));
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const longestStreak = (dates: string[]) => {
  let best = 0;
  let run = 0;
  dates.forEach((date, i) => {
    run = i > 0 && daysBetween(dates[i - 1], date) === 1 ? run + 1 : 1;
    if (run > best) best = run;
  });
  return best;
};

/**
 * Counts each pattern over the window ending on `today`, and works out which one
 * is carrying too much and which one is due. Recency looks at the whole log, so
 * a pattern last trained before the window still reports its real rest.
 */
export function movementBalance(entries: MovementEntry[], today: string): BalanceReport {
  const cutoff = shift(today, -(WINDOW_DAYS - 1));

  const loads: MovementLoad[] = MOVEMENTS.map((movement) => {
    const trained = entries.filter((e) => movementsFor(e.exercise).includes(movement));
    const dates = [...new Set(trained.filter((e) => e.date >= cutoff && e.date <= today).map((e) => e.date))].sort();
    const last = trained.reduce<string | null>((acc, e) => (e.date <= today && (!acc || e.date > acc) ? e.date : acc), null);
    const daysSinceLast = last ? Math.max(0, daysBetween(last, today)) : null;
    return {
      movement,
      days: dates.length,
      dates,
      daysSinceLast,
      rested: daysSinceLast === null || daysSinceLast >= REST_DAYS,
      streak: longestStreak(dates),
    };
  });

  const counts = loads.map((l) => l.days);
  const gap = Math.max(...counts) - Math.min(...counts);
  const overworked = gap >= IMBALANCE_GAP ? loads.reduce((a, b) => (b.days > a.days ? b : a)).movement : null;

  // Least-trained first; among equals, whichever has been resting longest.
  // Never trained sorts as the longest rest of all, but as a finite number so
  // two untrained patterns compare equal instead of NaN.
  const rest = (l: MovementLoad) => l.daysSinceLast ?? WINDOW_DAYS * 100;
  const nextUp =
    [...loads].filter((l) => l.rested).sort((a, b) => a.days - b.days || rest(b) - rest(a))[0]?.movement ?? null;

  return { loads, overworked, gap, nextUp };
}
