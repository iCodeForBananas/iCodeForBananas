import { describe, expect, it } from "vitest";
import { EXERCISE_MUSCLES, MUSCLE_GROUPS, weeklyCoverage } from "./coverage";

const group = (cov: ReturnType<typeof weeklyCoverage>, name: string) => cov.find((c) => c.muscle === name)!;

describe("weeklyCoverage", () => {
  it("credits the groups an exercise drives and, at half, the ones it assists", () => {
    const cov = weeklyCoverage([{ exercise: "Bench Press", date: "2026-10-17" }], "2026-10-17");
    expect(group(cov, "chest").score).toBe(1);
    expect(group(cov, "chest").exercises[0]).toEqual({ exercise: "Bench Press", days: 1, primary: true });
    expect(group(cov, "triceps").score).toBe(0.5);
    expect(group(cov, "triceps").exercises.find((e) => e.exercise === "Bench Press")).toEqual({
      exercise: "Bench Press",
      days: 1,
      primary: false,
    });
    expect(group(cov, "back").exercises.every((e) => e.days === 0)).toBe(true);
  });

  it("shows a week with no pulling as untouched back and biceps", () => {
    const logs = [
      { exercise: "Bench Press", date: "2026-10-13" },
      { exercise: "Squat", date: "2026-10-15" },
      { exercise: "Overhead Press", date: "2026-10-17" },
    ];
    const cov = weeklyCoverage(logs, "2026-10-17");
    expect(cov.filter((c) => c.score === 0).map((c) => c.muscle)).toEqual(["back", "biceps"]);
  });

  it("lists squats under quads and glutes even in a week without them", () => {
    const cov = weeklyCoverage([], "2026-10-17");
    for (const name of ["quads", "glutes"]) {
      expect(group(cov, name).exercises).toContainEqual({ exercise: "Squat", days: 0, primary: true });
    }
  });

  it("counts days, not entries, and lists drivers before assisters", () => {
    const logs = [
      { exercise: "Bench Press", date: "2026-10-16" },
      { exercise: "Bench Press", date: "2026-10-16" },
      { exercise: "Bench Press", date: "2026-10-17" },
      { exercise: "Overhead Press", date: "2026-10-17" },
    ];
    const shoulders = group(weeklyCoverage(logs, "2026-10-17"), "shoulders");
    expect(shoulders.exercises).toEqual([
      { exercise: "Overhead Press", days: 1, primary: true },
      { exercise: "Bench Press", days: 2, primary: false },
      { exercise: "Barbell Row", days: 0, primary: false },
    ]);
    expect(shoulders.score).toBe(2);
  });

  it("counts only the five 5x5 lifts", () => {
    const cov = weeklyCoverage([{ exercise: "Bicep Curls", date: "2026-10-17" }], "2026-10-17");
    expect(group(cov, "biceps")).toEqual({
      muscle: "biceps",
      score: 0,
      exercises: [{ exercise: "Barbell Row", days: 0, primary: false }],
    });
  });

  it("ignores logs outside the last seven days, in the future, or for unknown exercises", () => {
    const logs = [
      { exercise: "Squat", date: "2026-10-10" }, // 7 days back: just outside
      { exercise: "Squat", date: "2026-10-18" }, // tomorrow
      { exercise: "Push-ups", date: "2026-10-17" },
    ];
    for (const c of weeklyCoverage(logs, "2026-10-17")) {
      expect(c.score).toBe(0);
      expect(c.exercises.every((e) => e.days === 0)).toBe(true);
    }
    expect(group(weeklyCoverage([{ exercise: "Squat", date: "2026-10-11" }], "2026-10-17"), "quads").score).toBe(1);
  });

  it("returns every group head to toe", () => {
    expect(weeklyCoverage([], "2026-10-17").map((c) => c.muscle)).toEqual([...MUSCLE_GROUPS]);
  });
});

describe("EXERCISE_MUSCLES", () => {
  it("drives at least one group per exercise and never lists a group twice", () => {
    for (const { primary, assists } of Object.values(EXERCISE_MUSCLES)) {
      expect(primary.length).toBeGreaterThan(0);
      expect(new Set([...primary, ...assists]).size).toBe(primary.length + assists.length);
    }
  });

  it("is the 5x5 program, and reaches every muscle group from it", () => {
    expect(Object.keys(EXERCISE_MUSCLES).sort()).toEqual(
      ["Barbell Row", "Bench Press", "Deadlift", "Overhead Press", "Squat"],
    );
    const reached = new Set(Object.values(EXERCISE_MUSCLES).flatMap((m) => [...m.primary, ...m.assists]));
    expect([...reached].sort()).toEqual([...MUSCLE_GROUPS].sort());
  });
});
