import { describe, expect, it } from "vitest";
import {
  MOVEMENT_EXERCISES,
  movementBalance,
  movementsFor,
  type MovementEntry,
} from "./movementBalance";

const TODAY = "2026-03-15";

// Days back from TODAY, so the fixtures read the way the window does.
const ago = (n: number) => {
  const d = new Date("2026-03-15T12:00:00");
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const log = (exercise: string, daysAgo: number): MovementEntry => ({ exercise, date: ago(daysAgo) });

const load = (entries: MovementEntry[], movement: string) =>
  movementBalance(entries, TODAY).loads.find((l) => l.movement === movement)!;

describe("movementsFor", () => {
  it("puts each compound on its pattern", () => {
    expect(movementsFor("Bench Press")).toEqual(["push"]);
    expect(movementsFor("Overhead Press")).toEqual(["push"]);
    expect(movementsFor("Pull-ups")).toEqual(["pull"]);
    expect(movementsFor("Bent Over Rows")).toEqual(["pull"]);
    expect(movementsFor("Squat")).toEqual(["legs"]);
  });

  it("counts a deadlift as both a pull and a leg day", () => {
    expect(movementsFor("Deadlift")).toEqual(["pull", "legs"]);
  });

  it("returns nothing for an exercise it does not know", () => {
    expect(movementsFor("Bicep Curls")).toEqual([]);
  });

  it("lists every compound under some pattern", () => {
    const listed = Object.values(MOVEMENT_EXERCISES).flat();
    expect(listed).toContain("Deadlift");
    expect(new Set(listed).size).toBe(8);
  });
});

describe("movementBalance counts", () => {
  it("counts distinct days, not entries", () => {
    const entries = [log("Bench Press", 3), log("Push-ups", 3), log("Overhead Press", 1)];
    expect(load(entries, "push").days).toBe(2);
  });

  it("ignores anything older than the window", () => {
    expect(load([log("Squat", 14)], "legs").days).toBe(0);
    expect(load([log("Squat", 13)], "legs").days).toBe(1);
  });

  it("ignores dates logged ahead of today", () => {
    expect(load([{ exercise: "Squat", date: "2026-03-20" }], "legs").days).toBe(0);
  });

  it("reports zero for a pattern that was never trained", () => {
    const legs = load([log("Bench Press", 1)], "legs");
    expect(legs.days).toBe(0);
    expect(legs.daysSinceLast).toBeNull();
  });
});

describe("movementBalance rest", () => {
  it("counts rest from the last session even when it predates the window", () => {
    const pull = load([log("Pull-ups", 30)], "pull");
    expect(pull.days).toBe(0);
    expect(pull.daysSinceLast).toBe(30);
    expect(pull.rested).toBe(true);
  });

  it("treats yesterday and today as not yet rested", () => {
    expect(load([log("Pull-ups", 0)], "pull").rested).toBe(false);
    expect(load([log("Pull-ups", 1)], "pull").rested).toBe(false);
    expect(load([log("Pull-ups", 2)], "pull").rested).toBe(true);
  });

  it("finds the longest run of back-to-back days", () => {
    const entries = [log("Pull-ups", 9), log("Bent Over Rows", 4), log("Pull-ups", 3), log("Deadlift", 2)];
    expect(load(entries, "pull").streak).toBe(3);
  });

  it("does not call separated sessions a streak", () => {
    expect(load([log("Squat", 6), log("Squat", 3), log("Squat", 0)], "legs").streak).toBe(1);
  });
});

describe("movementBalance imbalance", () => {
  it("flags the pattern that has run ahead of the others", () => {
    const entries = [
      log("Pull-ups", 8),
      log("Bent Over Rows", 6),
      log("Pull-ups", 4),
      log("Bent Over Rows", 2),
      log("Bench Press", 5),
      log("Squat", 3),
    ];
    const report = movementBalance(entries, TODAY);
    expect(report.overworked).toBe("pull");
    expect(report.gap).toBe(3);
  });

  it("leaves an even spread alone", () => {
    const entries = [log("Bench Press", 5), log("Pull-ups", 4), log("Squat", 3)];
    const report = movementBalance(entries, TODAY);
    expect(report.overworked).toBeNull();
    expect(report.gap).toBe(0);
  });

  it("reports no imbalance on an empty log", () => {
    const report = movementBalance([], TODAY);
    expect(report.overworked).toBeNull();
    expect(report.nextUp).toBe("push");
  });
});

describe("movementBalance recommendation", () => {
  it("sends you to the pattern you have trained least", () => {
    const entries = [log("Pull-ups", 6), log("Bent Over Rows", 4), log("Bench Press", 5)];
    expect(movementBalance(entries, TODAY).nextUp).toBe("legs");
  });

  it("breaks a tie with whichever has rested longest", () => {
    const entries = [log("Bench Press", 9), log("Pull-ups", 5), log("Squat", 7)];
    expect(movementBalance(entries, TODAY).nextUp).toBe("push");
  });

  it("skips a pattern that is still inside its rest window", () => {
    // Legs is trained least but was worked yesterday, so push is what is due.
    const entries = [log("Squat", 1), log("Bench Press", 6), log("Pull-ups", 5), log("Bent Over Rows", 3)];
    expect(movementBalance(entries, TODAY).nextUp).toBe("push");
  });

  it("recommends nothing when every pattern was worked in the last two days", () => {
    const entries = [log("Bench Press", 0), log("Pull-ups", 1), log("Squat", 1)];
    expect(movementBalance(entries, TODAY).nextUp).toBeNull();
  });

  it("does not send you back to a pattern that is already overworked", () => {
    const entries = [log("Pull-ups", 7), log("Bent Over Rows", 5), log("Deadlift", 3), log("Bench Press", 6)];
    const report = movementBalance(entries, TODAY);
    expect(report.overworked).toBe("pull");
    expect(report.nextUp).not.toBe("pull");
  });
});
