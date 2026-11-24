import { describe, expect, it } from "vitest";
import { PROGRAM_TARGETS, WORKOUTS, liftCoverage, nextWorkout } from "./coverage";

const workout = (name: "A" | "B", date: string) => WORKOUTS[name].map((exercise) => ({ exercise, date }));
const by = (cov: ReturnType<typeof liftCoverage>) => Object.fromEntries(cov.map((c) => [c.exercise, c.days]));

describe("PROGRAM_TARGETS", () => {
  it("is two weeks of alternating workouts: A B A, B A B", () => {
    const logs = ["A", "B", "A", "B", "A", "B"].flatMap((w, i) => workout(w as "A" | "B", `2026-11-${String(10 + i * 2).padStart(2, "0")}`));
    const cov = liftCoverage(logs, "2026-11-23");
    expect(by(cov)).toEqual(PROGRAM_TARGETS);
    expect(cov.every((c) => c.remaining === 0)).toBe(true);
  });
});

describe("liftCoverage", () => {
  it("lists every lift in program order with what's left", () => {
    expect(liftCoverage(workout("A", "2026-11-23"), "2026-11-23")).toEqual([
      { exercise: "Squat", days: 1, target: 6, remaining: 5 },
      { exercise: "Bench Press", days: 1, target: 3, remaining: 2 },
      { exercise: "Barbell Row", days: 1, target: 3, remaining: 2 },
      { exercise: "Overhead Press", days: 0, target: 3, remaining: 3 },
      { exercise: "Deadlift", days: 0, target: 3, remaining: 3 },
    ]);
  });

  it("counts days, not entries, and never goes below zero remaining", () => {
    const logs = ["2026-11-20", "2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23"].map((date) => ({ exercise: "Deadlift", date }));
    expect(liftCoverage(logs, "2026-11-23").find((c) => c.exercise === "Deadlift")).toEqual({ exercise: "Deadlift", days: 4, target: 3, remaining: 0 });
  });

  it("looks back 14 days, ignores the future and anything outside the program", () => {
    const logs = [
      { exercise: "Squat", date: "2026-11-09" }, // 14 days back: just outside
      { exercise: "Squat", date: "2026-11-10" }, // 13 days back: in
      { exercise: "Squat", date: "2026-11-24" }, // tomorrow
      { exercise: "Bicep Curls", date: "2026-11-23" },
    ];
    expect(by(liftCoverage(logs, "2026-11-23"))).toEqual({ Squat: 1, "Bench Press": 0, "Barbell Row": 0, "Overhead Press": 0, Deadlift: 0 });
  });
});

describe("nextWorkout", () => {
  it("starts with A when nothing is logged", () => {
    expect(nextWorkout([], "2026-11-23")).toMatchObject({ workout: "A", lifts: ["Squat", "Bench Press", "Barbell Row"] });
  });

  it("picks the workout whose lifts are furthest behind", () => {
    const logs = [...workout("A", "2026-11-17"), ...workout("A", "2026-11-19"), ...workout("B", "2026-11-21")];
    const next = nextWorkout(logs, "2026-11-23");
    expect(next.workout).toBe("B");
    expect(next.reason).toContain("Overhead Press 1/3, Deadlift 1/3");
  });

  it("alternates from the last workout on a tie", () => {
    expect(nextWorkout([...workout("B", "2026-11-20"), ...workout("A", "2026-11-22")], "2026-11-23").workout).toBe("B");
    expect(nextWorkout([...workout("A", "2026-11-20"), ...workout("B", "2026-11-22")], "2026-11-23").workout).toBe("A");
  });

  it("still alternates once the cycle is complete", () => {
    const logs = ["A", "B", "A", "B", "A", "B"].flatMap((w, i) => workout(w as "A" | "B", `2026-11-${String(10 + i * 2).padStart(2, "0")}`));
    expect(nextWorkout(logs, "2026-11-23").workout).toBe("A");
  });
});
