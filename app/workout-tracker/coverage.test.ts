import { describe, expect, it } from "vitest";
import { EXERCISE_MUSCLES, MUSCLE_GROUPS, weeklyCoverage } from "./coverage";

const group = (cov: ReturnType<typeof weeklyCoverage>, name: string) => cov.find((c) => c.muscle === name)!;

describe("weeklyCoverage", () => {
  it("credits the groups an exercise drives and, at half, the ones it assists", () => {
    const cov = weeklyCoverage([{ exercise: "Bench Press", date: "2026-10-17" }], "2026-10-17");
    expect(group(cov, "chest")).toEqual({
      muscle: "chest",
      score: 1,
      exercises: [{ exercise: "Bench Press", days: 1, primary: true }],
    });
    expect(group(cov, "triceps").score).toBe(0.5);
    expect(group(cov, "triceps").exercises[0].primary).toBe(false);
    expect(group(cov, "back").exercises).toEqual([]);
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

  it("counts days, not entries, and lists drivers before assisters", () => {
    const logs = [
      { exercise: "Pull-ups", date: "2026-10-16" },
      { exercise: "Pull-ups", date: "2026-10-16" },
      { exercise: "Pull-ups", date: "2026-10-17" },
      { exercise: "Bicep Curls", date: "2026-10-17" },
    ];
    const biceps = group(weeklyCoverage(logs, "2026-10-17"), "biceps");
    expect(biceps.exercises).toEqual([
      { exercise: "Bicep Curls", days: 1, primary: true },
      { exercise: "Pull-ups", days: 2, primary: false },
    ]);
    expect(biceps.score).toBe(2);
  });

  it("ignores logs outside the last seven days, in the future, or for unknown exercises", () => {
    const logs = [
      { exercise: "Squat", date: "2026-10-10" }, // 7 days back: just outside
      { exercise: "Squat", date: "2026-10-18" }, // tomorrow
      { exercise: "Jumping Jacks", date: "2026-10-17" },
    ];
    for (const c of weeklyCoverage(logs, "2026-10-17")) expect(c).toMatchObject({ score: 0, exercises: [] });
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

  it("reaches every muscle group from some exercise", () => {
    const reached = new Set(Object.values(EXERCISE_MUSCLES).flatMap((m) => m.primary));
    expect([...reached].sort()).toEqual([...MUSCLE_GROUPS].sort());
  });
});
