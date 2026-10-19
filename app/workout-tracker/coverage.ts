/**
 * Which muscle groups the last week of logs actually reached, and through
 * which exercises, so a gap is obvious: a week of bench and curls with no
 * pull-ups shows back as untouched.
 *
 * Every exercise names the groups it drives and the groups that only assist
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
  "Barbell Row": { primary: ["back"], assists: ["biceps", "shoulders"] },
  "Bench Press": { primary: ["chest"], assists: ["triceps", "shoulders"] },
  "Bent Over Rows": { primary: ["back"], assists: ["biceps", "shoulders"] },
  "Bicep Curls": { primary: ["biceps"], assists: [] },
  "Bulgarian Split Squats": { primary: ["quads", "glutes"], assists: ["hamstrings"] },
  Deadlift: { primary: ["hamstrings", "glutes", "back"], assists: ["quads", "core"] },
  Dips: { primary: ["chest", "triceps"], assists: ["shoulders"] },
  "Overhead Extension": { primary: ["triceps"], assists: [] },
  "Overhead Press": { primary: ["shoulders"], assists: ["triceps", "core"] },
  "Pike Push-ups": { primary: ["shoulders"], assists: ["triceps"] },
  "Pull-ups": { primary: ["back"], assists: ["biceps"] },
  "Push-ups": { primary: ["chest"], assists: ["triceps", "shoulders"] },
  "Sit-ups": { primary: ["core"], assists: [] },
  Squat: { primary: ["quads", "glutes"], assists: ["hamstrings", "core"] },
  "Weighted Pull-Up": { primary: ["back"], assists: ["biceps"] },
};

const ASSIST_WEIGHT = 0.5;

export interface MuscleCoverage {
  muscle: MuscleGroup;
  /** Days driven count 1, days assisted 0.5. */
  score: number;
  /** What reached this group, the ones driving it first, then most days first. */
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
    for (const [exercise, dates] of daysByExercise) {
      const { primary, assists } = EXERCISE_MUSCLES[exercise];
      if (primary.includes(muscle)) exercises.push({ exercise, days: dates.size, primary: true });
      else if (assists.includes(muscle)) exercises.push({ exercise, days: dates.size, primary: false });
    }
    exercises.sort(
      (a, b) => Number(b.primary) - Number(a.primary) || b.days - a.days || a.exercise.localeCompare(b.exercise),
    );
    const score = exercises.reduce((sum, e) => sum + e.days * (e.primary ? 1 : ASSIST_WEIGHT), 0);
    return { muscle, score, exercises };
  });
}
