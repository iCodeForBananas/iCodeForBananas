import { describe, expect, it } from "vitest";
import { formatPercentile, latestWeights, normalCdf, populationPercentile } from "./percentile";

describe("normalCdf", () => {
  it("matches known values", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1)).toBeCloseTo(0.1587, 3);
  });
});

describe("populationPercentile", () => {
  it("puts the population median at the 50th", () => {
    expect(populationPercentile("Bench Press", 0.65 * 200, 200)).toBeCloseTo(50, 3);
  });

  it("rises with weight and falls with bodyweight", () => {
    const a = populationPercentile("Squat", 185, 185)!;
    expect(populationPercentile("Squat", 225, 185)!).toBeGreaterThan(a);
    expect(populationPercentile("Squat", 185, 220)!).toBeLessThan(a);
  });

  it("returns null for unmodelled lifts or nothing logged", () => {
    expect(populationPercentile("Bicep Curls", 50, 185)).toBeNull();
    expect(populationPercentile("Deadlift", 0, 185)).toBeNull();
  });
});

describe("formatPercentile", () => {
  it("adds ordinal suffixes", () => {
    expect(formatPercentile(1.2)).toBe("1st");
    expect(formatPercentile(22)).toBe("22nd");
    expect(formatPercentile(63)).toBe("63rd");
    expect(formatPercentile(12)).toBe("12th");
    expect(formatPercentile(50.4)).toBe("50th");
  });

  it("keeps a decimal in the top 1% and never claims 100th", () => {
    expect(formatPercentile(99.46)).toBe("99.4th");
    expect(formatPercentile(99.999)).toBe("99.9th");
    expect(formatPercentile(0.01)).toBe("1st");
  });
});

describe("latestWeights", () => {
  it("takes the most recent date, not the heaviest", () => {
    const m = latestWeights([
      { exercise: "Squat", date: "2026-09-01", weight: 225 },
      { exercise: "Squat", date: "2026-09-20", weight: 205 },
      { exercise: "Bench Press", date: "2026-09-10", weight: 155 },
    ]);
    expect(m.get("Squat")).toEqual({ weight: 205, date: "2026-09-20" });
    expect(m.get("Bench Press")?.weight).toBe(155);
  });
});
