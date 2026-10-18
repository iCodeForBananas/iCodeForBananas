import { describe, expect, it } from "vitest";
import { BODY_PARTS, EXERCISE_LOAD, bodyPartLoads, exercisesFor, loadStatus, readyInDays } from "./intensity";

const part = (loads: ReturnType<typeof bodyPartLoads>, name: string) => loads.find((l) => l.part === name)!;

/** `exercise` once a day for `n` days ending on 2026-10-17. */
const daily = (exercise: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({ exercise, date: `2026-10-${String(17 - i).padStart(2, "0")}` }));

describe("bodyPartLoads", () => {
  it("rates a heavy bench well above a set of push-ups", () => {
    const bench = part(bodyPartLoads([{ exercise: "Bench Press", date: "2026-10-17" }], "2026-10-17"), "chest");
    const pushups = part(bodyPartLoads([{ exercise: "Push-ups", date: "2026-10-17" }], "2026-10-17"), "chest");
    expect(bench.fatigue).toBeGreaterThan(pushups.fatigue * 3);
    expect(bench.status).toBe("Heavy");
    expect(pushups.status).toBe("Light");
  });

  it("has push-ups done every day always ready again the next day", () => {
    const chest = part(bodyPartLoads(daily("Push-ups", 14), "2026-10-17"), "chest");
    expect(chest.status).toBe("Worked");
    expect(chest.readyInDays).toBe(1);
    expect(chest.days).toHaveLength(14);
  });

  it("has a bench ready again two days later, not the next day", () => {
    const logs = [{ exercise: "Bench Press", date: "2026-10-15" }];
    expect(part(bodyPartLoads(logs, "2026-10-15"), "chest").readyInDays).toBe(2);
    expect(part(bodyPartLoads(logs, "2026-10-16"), "chest").readyInDays).toBe(1);
    expect(part(bodyPartLoads(logs, "2026-10-17"), "chest").readyInDays).toBe(0);
  });

  it("flags stacked pressing days, including on the muscles that only assist", () => {
    const logs = [
      { exercise: "Bench Press", date: "2026-10-16" },
      { exercise: "Overhead Press", date: "2026-10-17" },
      { exercise: "Dips", date: "2026-10-17" },
    ];
    const loads = bodyPartLoads(logs, "2026-10-17");
    expect(part(loads, "chest").status).toBe("Heavy");
    expect(part(loads, "shoulders").status).toBe("Heavy");
    expect(part(loads, "arms").fatigue).toBeGreaterThan(0.8);
    expect(part(loads, "legs").status).toBe("Fresh");
  });

  it("sums same-day sessions into one day per body part", () => {
    const logs = [
      { exercise: "Pull-ups", date: "2026-10-17" },
      { exercise: "Barbell Row", date: "2026-10-17" },
    ];
    const back = part(bodyPartLoads(logs, "2026-10-17"), "back");
    expect(back.days).toEqual([{ date: "2026-10-17", load: 1.3 }]);
  });

  it("ignores logs outside the window, in the future, or for unknown exercises", () => {
    const logs = [
      { exercise: "Squat", date: "2026-10-03" }, // 14 days back: just outside
      { exercise: "Squat", date: "2026-10-18" }, // tomorrow
      { exercise: "Jumping Jacks", date: "2026-10-17" },
    ];
    for (const l of bodyPartLoads(logs, "2026-10-17")) {
      expect(l.days).toEqual([]);
      expect(l.fatigue).toBe(0);
    }
  });

  it("returns every body part in order", () => {
    expect(bodyPartLoads([], "2026-10-17").map((l) => l.part)).toEqual([...BODY_PARTS]);
  });
});

describe("loadStatus / readyInDays", () => {
  it("steps up through the statuses", () => {
    expect([0, 0.3, 0.7, 1.2, 2].map(loadStatus)).toEqual(["Fresh", "Light", "Worked", "Heavy", "Overworked"]);
  });

  it("counts whole days until fatigue is under the ready line", () => {
    expect(readyInDays(0.49)).toBe(0);
    expect(readyInDays(0.5)).toBe(1);
    expect(readyInDays(1)).toBe(2);
    expect(readyInDays(1.9)).toBe(2);
    expect(readyInDays(2)).toBe(3);
  });
});

describe("exercisesFor", () => {
  it("lists the lifts driving a part first, then the ones assisting", () => {
    const chest = exercisesFor("chest");
    expect(chest[0]).toEqual({ exercise: "Bench Press", primary: true });
    expect(chest.find((e) => e.exercise === "Push-ups")?.primary).toBe(false);
    expect(chest.findIndex((e) => !e.primary)).toBeGreaterThan(chest.findLastIndex((e) => e.primary));
  });

  it("covers every exercise somewhere", () => {
    const listed = new Set(BODY_PARTS.flatMap((p) => exercisesFor(p).map((e) => e.exercise)));
    expect([...listed].sort()).toEqual(Object.keys(EXERCISE_LOAD).sort());
  });
});
