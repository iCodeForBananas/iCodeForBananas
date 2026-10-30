import { describe, expect, it } from "vitest";
import { advance, atEnd, clampSpeed, DEFAULT_SPEED, MAX_SPEED, MIN_SPEED, nudgeSpeed, split } from "./autoscroll";

describe("advance", () => {
  it("moves by a fraction of a pixel, not a whole one", () => {
    // One frame at 60Hz at the default speed is well under a pixel. If this
    // ever returns a whole number the scroll has started stepping.
    const after = advance(0, DEFAULT_SPEED, 1000 / 60, 10000);
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThan(1);
    expect(Number.isInteger(after)).toBe(false);
  });

  it("covers the same distance whatever the frame rate", () => {
    const oneSecond = (fps: number) => {
      let position = 0;
      for (let i = 0; i < fps; i++) position = advance(position, 30, 1000 / fps, 10000);
      return position;
    };
    expect(oneSecond(60)).toBeCloseTo(30, 6);
    expect(oneSecond(120)).toBeCloseTo(30, 6);
    expect(oneSecond(24)).toBeCloseTo(30, 6);
  });

  it("does not fling the song after a long pause", () => {
    // A backgrounded tab can hand back a gap of minutes. One frame may never
    // be worth more than a moment of scrolling.
    expect(advance(0, 30, 60_000, 10_000)).toBeLessThan(5);
  });

  it("stops at the bottom", () => {
    expect(advance(999, 100, 1000, 1000)).toBe(1000);
    expect(atEnd(1000, 1000)).toBe(true);
    expect(atEnd(500, 1000)).toBe(false);
  });

  it("ignores a negative or absent frame time", () => {
    expect(advance(10, 30, -5, 1000)).toBe(10);
    expect(advance(10, 30, 0, 1000)).toBe(10);
  });
});

describe("speed", () => {
  it("stays inside the range whatever it is handed", () => {
    expect(clampSpeed(0)).toBe(MIN_SPEED);
    expect(clampSpeed(1000)).toBe(MAX_SPEED);
    expect(clampSpeed(20.4)).toBe(20);
  });

  it("nudges finely when slow and coarsely when fast", () => {
    expect(nudgeSpeed(10, 1)).toBe(11);
    expect(nudgeSpeed(30, 1)).toBe(32);
    expect(nudgeSpeed(80, 1)).toBe(85);
    expect(nudgeSpeed(10, -1)).toBe(9);
  });

  it("cannot be nudged out of range", () => {
    expect(nudgeSpeed(MIN_SPEED, -1)).toBe(MIN_SPEED);
    expect(nudgeSpeed(MAX_SPEED, 1)).toBe(MAX_SPEED);
  });
});

describe("split", () => {
  it("separates what scrollTop can carry from what it cannot", () => {
    expect(split(10)).toEqual({ whole: 10, fraction: 0 });
    expect(split(10.25)).toEqual({ whole: 10, fraction: 0.25 });
  });

  it("always leaves a positive remainder, so the transform only moves one way", () => {
    for (const position of [0, 0.5, 10.75, 1234.01]) {
      const { whole, fraction } = split(position);
      expect(fraction).toBeGreaterThanOrEqual(0);
      expect(fraction).toBeLessThan(1);
      expect(whole + fraction).toBeCloseTo(position, 9);
    }
  });
})
