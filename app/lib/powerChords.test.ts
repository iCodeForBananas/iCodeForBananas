import { describe, expect, it } from "vitest";
import { sharpNotes } from "./chordShapes";
import { powerChordLabel, powerChordOnString, powerChordShapes } from "./powerChords";
import { DROP_D_TUNING, OPEN_G_TUNING, STANDARD_TUNING, TUNINGS } from "./tunings";

const soundedPitchClasses = (frets: number[], midi: number[]) =>
  [...new Set(frets.flatMap((f, i) => (f < 0 ? [] : [(midi[i] + f) % 12])))].sort((a, b) => a - b);

describe("powerChordOnString", () => {
  it("plays G5 off the 6th string at the 3rd fret", () => {
    expect(powerChordOnString("G", 0)?.shape).toEqual({
      frets: [3, 5, 5, -1, -1, -1],
      fingers: [1, 3, 4, 0, 0, 0],
    });
  });

  it("plays G5 off the 5th string at the 10th fret", () => {
    expect(powerChordOnString("G", 1)?.shape.frets).toEqual([-1, 10, 12, 12, -1, -1]);
  });

  it("uses open strings when the root is the open string", () => {
    expect(powerChordOnString("E", 0)?.shape.frets).toEqual([0, 2, 2, -1, -1, -1]);
    expect(powerChordOnString("A", 1)?.shape.frets).toEqual([-1, 0, 2, 2, -1, -1]);
  });

  it("reads flats and sharps alike", () => {
    expect(powerChordOnString("Bb", 1)?.shape.frets).toEqual(powerChordOnString("A#", 1)?.shape.frets);
    expect(powerChordOnString("F#", 0)?.shape.frets).toEqual([2, 4, 4, -1, -1, -1]);
  });

  it("is a one-finger grip on Drop D's low string", () => {
    expect(powerChordOnString("G", 0, DROP_D_TUNING)?.shape).toEqual({
      frets: [5, 5, 5, -1, -1, -1],
      fingers: [1, 1, 1, 0, 0, 0],
    });
    expect(powerChordOnString("D", 0, DROP_D_TUNING)?.shape.frets).toEqual([0, 0, 0, -1, -1, -1]);
  });

  it("follows Open G's strings", () => {
    expect(powerChordOnString("G", 0, OPEN_G_TUNING)?.shape.frets).toEqual([5, 7, 5, -1, -1, -1]);
  });
});

describe("powerChordShapes", () => {
  it("offers a 6th-string and a 5th-string root", () => {
    expect(powerChordShapes("C").map((p) => [p.id, p.rootFret])).toEqual([
      ["power-0", 8],
      ["power-1", 3],
    ]);
  });

  it("sounds only the root and fifth, with the root lowest, for every root on every tuning", () => {
    for (const tuning of TUNINGS) {
      for (const note of sharpNotes) {
        const shapes = powerChordShapes(note, tuning);
        expect(shapes.length, `${note} on ${tuning.name}`).toBeGreaterThan(0);
        const root = sharpNotes.indexOf(note);
        const rootPc = (root + 9) % 12; // A = 9
        for (const { shape, rootString } of shapes) {
          const fifthPc = (rootPc + 7) % 12;
          expect(soundedPitchClasses(shape.frets, tuning.midi), `${note}5 on ${tuning.name}`).toEqual(
            [rootPc, fifthPc].sort((a, b) => a - b)
          );
          const lowest = shape.frets.findIndex((f) => f >= 0);
          expect(lowest).toBe(rootString);
          expect((tuning.midi[lowest] + shape.frets[lowest]) % 12).toBe(rootPc);
          const fretted = shape.frets.filter((f) => f > 0);
          if (fretted.length) expect(Math.max(...fretted) - Math.min(...fretted)).toBeLessThanOrEqual(3);
        }
      }
    }
  });

  it("defaults to standard tuning", () => {
    expect(powerChordShapes("G")).toEqual(powerChordShapes("G", STANDARD_TUNING));
  });
});

describe("powerChordLabel", () => {
  it("names the chord by its root and a 5", () => {
    expect(powerChordLabel("G")).toBe("G5");
    expect(powerChordLabel("Bb")).toBe("Bb5");
  });
});
