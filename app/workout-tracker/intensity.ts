/**
 * How hard each body part has been worked lately, not just how often.
 *
 * Counting sessions treats 3x12 push-ups the same as a 5x5 bench, which is
 * the wrong answer: the push-ups can be done every day, the bench can't. So
 * every exercise carries a load per body part it works, on a scale where 1
 * is one heavy barbell session for the muscle that drives the lift. The
 * muscles that assist (triceps on a bench, biceps on a row) take a smaller
 * share, which is what lets back-to-back press days show up on the arms and
 * shoulders as well as the chest.
 *
 * Logs only record the exercise and a weight, not sets or reps, so the loads
 * assume a normal working session of each: 5x5-ish for the barbell lifts, a
 * few sets near failure for the bodyweight ones. They're estimates to steer
 * by, not measurements.
 *
 * Fatigue left over from a session halves every day. With these numbers a
 * daily set of push-ups is always ready again the next day, while a heavy
 * bench isn't ready until two days later, the usual Mon/Wed/Fri spacing.
 */

export const BODY_PARTS = ["chest", "back", "shoulders", "arms", "legs", "core"] as const;
export type BodyPart = (typeof BODY_PARTS)[number];

export const EXERCISE_LOAD: Record<string, Partial<Record<BodyPart, number>>> = {
  "Barbell Row": { back: 0.8, arms: 0.3 },
  "Bench Press": { chest: 1, shoulders: 0.4, arms: 0.4 },
  "Bent Over Rows": { back: 0.8, arms: 0.3 },
  "Bicep Curls": { arms: 0.5 },
  "Bulgarian Split Squats": { legs: 0.7 },
  Deadlift: { back: 1, legs: 0.8, core: 0.3 },
  Dips: { chest: 0.5, arms: 0.4, shoulders: 0.2 },
  "Overhead Extension": { arms: 0.5 },
  "Overhead Press": { shoulders: 1, arms: 0.4 },
  "Pike Push-ups": { shoulders: 0.35, arms: 0.15 },
  "Pull-ups": { back: 0.5, arms: 0.25 },
  "Push-ups": { chest: 0.3, arms: 0.1, shoulders: 0.1 },
  "Sit-ups": { core: 0.3 },
  Squat: { legs: 1, core: 0.3 },
  "Weighted Pull-Up": { back: 0.8, arms: 0.4 },
};

/** A load at or above this is a body part doing the main work, not assisting. */
const PRIMARY_LOAD = 0.5;

/** Exercises that work `part`, the ones driving it first, heaviest first within each. */
export function exercisesFor(part: BodyPart): { exercise: string; primary: boolean }[] {
  return Object.entries(EXERCISE_LOAD)
    .filter(([, loads]) => (loads[part] ?? 0) > 0)
    .sort(([a, la], [b, lb]) => (lb[part] ?? 0) - (la[part] ?? 0) || a.localeCompare(b))
    .map(([exercise, loads]) => ({ exercise, primary: (loads[part] ?? 0) >= PRIMARY_LOAD }));
}

export type LoadStatus = "Fresh" | "Light" | "Worked" | "Heavy" | "Overworked";

/** Upper bounds, exclusive, on the fatigue for each status; past the last is Overworked. */
const STATUS_BOUNDS: [LoadStatus, number][] = [
  ["Fresh", 0.15],
  ["Light", 0.5],
  ["Worked", 1],
  ["Heavy", 1.5],
];

/** Below this a body part is ready to be trained hard again. */
const READY_BELOW = STATUS_BOUNDS[1][1];

export function loadStatus(fatigue: number): LoadStatus {
  for (const [status, bound] of STATUS_BOUNDS) if (fatigue < bound) return status;
  return "Overworked";
}

/** Days from now until `fatigue` decays back under the ready line; 0 is ready today. */
export function readyInDays(fatigue: number): number {
  if (fatigue < READY_BELOW) return 0;
  // fatigue * 0.5^d < READY_BELOW, strictly
  return Math.floor(Math.log2(fatigue / READY_BELOW)) + 1;
}

export interface BodyPartLoad {
  part: BodyPart;
  /** Days in the window this part was worked, oldest first, with that day's total load. */
  days: { date: string; load: number }[];
  /** What's left as of `today`, with today's own sessions counted in full. */
  fatigue: number;
  status: LoadStatus;
  readyInDays: number;
}

// noon avoids DST edges shifting a day across a boundary
const dayNumber = (d: string) => Math.round(new Date(d + "T12:00:00").getTime() / 86400000);

/**
 * Load per body part over the `windowDays` ending on `today` (YYYY-MM-DD,
 * inclusive). Logs dated after `today` are ignored. Exercises not in
 * EXERCISE_LOAD contribute nothing.
 */
export function bodyPartLoads(
  logs: { exercise: string; date: string }[],
  today: string,
  windowDays = 14,
): BodyPartLoad[] {
  const end = dayNumber(today);
  const byPart = new Map<BodyPart, Map<string, number>>(BODY_PARTS.map((p) => [p, new Map()]));
  for (const l of logs) {
    const ago = end - dayNumber(l.date);
    if (ago < 0 || ago >= windowDays) continue;
    for (const [part, load] of Object.entries(EXERCISE_LOAD[l.exercise] ?? {}) as [BodyPart, number][]) {
      const days = byPart.get(part)!;
      days.set(l.date, (days.get(l.date) ?? 0) + load);
    }
  }
  return BODY_PARTS.map((part) => {
    const days = [...byPart.get(part)!].map(([date, load]) => ({ date, load })).sort((a, b) => a.date.localeCompare(b.date));
    const fatigue = days.reduce((sum, d) => sum + d.load * 0.5 ** (end - dayNumber(d.date)), 0);
    return { part, days, fatigue, status: loadStatus(fatigue), readyInDays: readyInDays(fatigue) };
  });
}
