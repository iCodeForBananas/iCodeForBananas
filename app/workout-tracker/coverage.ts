/**
 * How the last two weeks of logs measure up to the StrongLifts 5x5 program,
 * lift by lift.
 *
 * The program alternates two workouts, three a week:
 *   A: Squat, Bench Press, Barbell Row
 *   B: Squat, Overhead Press, Deadlift
 * so it repeats every two weeks (A B A, then B A B): six workouts, with
 * Squat in every one and each other lift in three. Those are the targets
 * over a 14-day window. A lift logged twice on one day counts once, and
 * anything outside the five lifts doesn't count.
 */

export const WINDOW_DAYS = 14;

/** Workouts per lift in WINDOW_DAYS, in program order. */
export const PROGRAM_TARGETS: Record<string, number> = {
  Squat: 6,
  "Bench Press": 3,
  "Barbell Row": 3,
  "Overhead Press": 3,
  Deadlift: 3,
};

export const WORKOUTS = {
  A: ["Squat", "Bench Press", "Barbell Row"],
  B: ["Squat", "Overhead Press", "Deadlift"],
} as const;
export type WorkoutName = keyof typeof WORKOUTS;

export interface LiftCoverage {
  exercise: string;
  /** Days it was logged in the window. */
  days: number;
  target: number;
  /** How many more it needs to reach the target; 0 once there. */
  remaining: number;
}

// noon avoids DST edges shifting a day across a boundary
const dayNumber = (d: string) => Math.round(new Date(d + "T12:00:00").getTime() / 86400000);

/** The days each program lift was logged in the `windowDays` ending on `today` (YYYY-MM-DD, inclusive). */
function daysByLift(logs: { exercise: string; date: string }[], today: string, windowDays: number) {
  const end = dayNumber(today);
  const days = new Map<string, Set<string>>(Object.keys(PROGRAM_TARGETS).map((e) => [e, new Set()]));
  for (const l of logs) {
    const ago = end - dayNumber(l.date);
    if (ago < 0 || ago >= windowDays) continue;
    days.get(l.exercise)?.add(l.date);
  }
  return days;
}

/** Each lift against its target, in program order. Logs after `today` are ignored. */
export function liftCoverage(logs: { exercise: string; date: string }[], today: string, windowDays = WINDOW_DAYS): LiftCoverage[] {
  const days = daysByLift(logs, today, windowDays);
  return Object.entries(PROGRAM_TARGETS).map(([exercise, target]) => {
    const n = days.get(exercise)!.size;
    return { exercise, days: n, target, remaining: Math.max(0, target - n) };
  });
}
