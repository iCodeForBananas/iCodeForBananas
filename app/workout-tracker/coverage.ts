/**
 * Which muscle groups the last week of logs actually reached, and through
 * which exercises, so a gap is obvious: a week of squat and bench with no
 * rows or deadlifts shows back as untouched, alongside the lifts that fix it.
 *
 * The lifts are the five of a 5x5 program, alternating two workouts:
 *   A: Squat, Bench Press, Barbell Row
 *   B: Squat, Overhead Press, Deadlift
 * Anything else logged doesn't count toward coverage. Arms and core have no
 * lift of their own; they're worked assisting the others.
 *
 * Every lift names the groups it drives and the groups that only assist
 * it (triceps on a bench, biceps on a row). A day an exercise was logged
 * scores 1 for each group it drives and 0.5 for each it assists. Logging the
 * same exercise twice on one day is still one day.
 */

/** Head to toe, so the panel reads down the body. */
export const MUSCLE_GROUPS = [
  "shoulders",
  "chest",
  "back",
  "biceps",
  "triceps",
  "core",
  "glutes",
  "quads",
  "hamstrings",
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const EXERCISE_MUSCLES: Record<string, { primary: MuscleGroup[]; assists: MuscleGroup[] }> = {
  Squat: { primary: ["quads", "glutes"], assists: ["hamstrings", "core"] },
  "Bench Press": { primary: ["chest"], assists: ["triceps", "shoulders"] },
  "Barbell Row": { primary: ["back"], assists: ["biceps", "shoulders"] },
  "Overhead Press": { primary: ["shoulders"], assists: ["triceps", "core"] },
  Deadlift: { primary: ["hamstrings", "glutes", "back"], assists: ["quads", "core"] },
};

const ASSIST_WEIGHT = 0.5;

export interface MuscleCoverage {
  muscle: MuscleGroup;
  /** Days driven count 1, days assisted 0.5. */
  score: number;
  /**
   * Every exercise that works this group, with the days it was logged in the
   * window (0 if not). The ones driving it first, then most days first.
   */
  exercises: { exercise: string; days: number; primary: boolean }[];
}

// noon avoids DST edges shifting a day across a boundary
const dayNumber = (d: string) => Math.round(new Date(d + "T12:00:00").getTime() / 86400000);

/**
 * Coverage per muscle group over the `windowDays` ending on `today`
 * (YYYY-MM-DD, inclusive), in MUSCLE_GROUPS order. Logs dated after `today`
 * are ignored, and exercises not in EXERCISE_MUSCLES contribute nothing.
 */
export function weeklyCoverage(
  logs: { exercise: string; date: string }[],
  today: string,
  windowDays = 7,
): MuscleCoverage[] {
  const end = dayNumber(today);
  const daysByExercise = new Map<string, Set<string>>();
  for (const l of logs) {
    const ago = end - dayNumber(l.date);
    if (ago < 0 || ago >= windowDays || !EXERCISE_MUSCLES[l.exercise]) continue;
    const days = daysByExercise.get(l.exercise) ?? new Set();
    days.add(l.date);
    daysByExercise.set(l.exercise, days);
  }

  return MUSCLE_GROUPS.map((muscle) => {
    const exercises: MuscleCoverage["exercises"] = [];
    for (const [exercise, { primary, assists }] of Object.entries(EXERCISE_MUSCLES)) {
      const days = daysByExercise.get(exercise)?.size ?? 0;
      if (primary.includes(muscle)) exercises.push({ exercise, days, primary: true });
      else if (assists.includes(muscle)) exercises.push({ exercise, days, primary: false });
    }
    exercises.sort(
      (a, b) => Number(b.primary) - Number(a.primary) || b.days - a.days || a.exercise.localeCompare(b.exercise),
    );
    const score = exercises.reduce((sum, e) => sum + e.days * (e.primary ? 1 : ASSIST_WEIGHT), 0);
    return { muscle, score, exercises };
  });
}
