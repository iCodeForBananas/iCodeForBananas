import { describe, expect, it } from "vitest";
import { latestWeights, percentileBand, populationPercentile } from "./percentile";

describe("populationPercentile", () => {
  it("interpolates linearly within a band", () => {
    // Bench Press: 25th at 105, 50th at 125 — halfway between is 115.
    expect(populationPercentile("Bench Press", 115)).toBeCloseTo(37.5, 6);
  });

  it("matches the table exactly at a band boundary", () => {
    expect(populationPercentile("Bench Press", 105)).toBeCloseTo(25, 6);
  });

  it("scales down to 0 below the table's lowest band", () => {
    expect(populationPercentile("Bench Press", 0)).toBeNull();
    // Half of the 5th-percentile weight (65) scales to half of 5.
    expect(populationPercentile("Bench Press", 32.5)).toBeCloseTo(2.5, 6);
  });

  it("holds at the table's top band rather than extrapolating past it", () => {
    expect(populationPercentile("Bench Press", 245)).toBeCloseTo(99, 6);
    expect(populationPercentile("Bench Press", 400)).toBeCloseTo(99, 6);
  });

  it("returns null for unmodelled lifts or nothing logged", () => {
    expect(populationPercentile("Bicep Curls", 50)).toBeNull();
    expect(populationPercentile("Deadlift", 0)).toBeNull();
  });
});

describe("percentileBand", () => {
  it("names the band a weight falls in, not a single ordinal", () => {
    expect(percentileBand("Bench Press", 115)).toBe("25th–50th");
  });

  it("assigns an exact boundary weight to the band it starts", () => {
    expect(percentileBand("Bench Press", 125)).toBe("50th–75th");
  });

  it("labels below the lowest band and at/above the highest", () => {
    expect(percentileBand("Bench Press", 30)).toBe("Below 5th");
    expect(percentileBand("Bench Press", 245)).toBe("99th+");
    expect(percentileBand("Bench Press", 400)).toBe("99th+");
  });

  it("returns null for unmodelled lifts or nothing logged", () => {
    expect(percentileBand("Bicep Curls", 50)).toBeNull();
    expect(percentileBand("Squat", 0)).toBeNull();
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
