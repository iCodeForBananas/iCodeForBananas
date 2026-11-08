import { describe, expect, it } from "vitest";
import { aShapeTemplates, chordShapes, eShapeTemplates, sharpNotes, type ChordShape } from "./chordShapes";
import { getNeckVoicings, TYPE_GROUPS } from "./chordVoicings";
import { TRIAD_STRING_SETS, triadVoicings, type TriadVoicing } from "./triads";
import { DROP_D_TUNING, retuneShape, STANDARD_TUNING, tuningById } from "./tunings";

const pitches = (shape: ChordShape, midi: number[]) =>
  shape.frets.map((fret, i) => (fret < 0 ? null : midi[i] + fret));

const pitchClasses = (shape: ChordShape, midi: number[]) =>
  [...new Set(pitches(shape, midi).flatMap((p) => (p === null ? [] : [p % 12])))].sort((a, b) => a - b);

const everyShape: [string, ChordShape][] = [
  ...Object.entries(chordShapes).flatMap(([name, shapes]) =>
    shapes.map((s): [string, ChordShape] => [name, s])
  ),
  ...Object.entries({ ...eShapeTemplates }).map(([name, s]): [string, ChordShape] => [`E-shape ${name}`, s!]),
  ...Object.entries({ ...aShapeTemplates }).map(([name, s]): [string, ChordShape] => [`A-shape ${name}`, s!]),
];

describe("retuneShape", () => {
  it("leaves shapes alone in standard tuning", () => {
    for (const [, shape] of everyShape) {
      expect(retuneShape(shape, STANDARD_TUNING).frets).toEqual(shape.frets);
    }
  });

  it("keeps every chord's notes in drop D, on every string it still plays", () => {
    for (const [name, shape] of everyShape) {
      const retuned = retuneShape(shape, DROP_D_TUNING);
      expect(pitchClasses(retuned, DROP_D_TUNING.midi), name).toEqual(pitchClasses(shape, STANDARD_TUNING.midi));

      const before = pitches(shape, STANDARD_TUNING.midi);
      pitches(retuned, DROP_D_TUNING.midi).forEach((pitch, i) => {
        if (pitch !== null) expect(pitch, name).toBe(before[i]);
      });
    }
  });

  it("frets the low string two higher when the hand is already there", () => {
    expect(retuneShape(chordShapes["F Major"][0], DROP_D_TUNING).frets).toEqual([3, 3, 3, 2, 1, 1]);
    expect(retuneShape(chordShapes["E Major"][0], DROP_D_TUNING).frets).toEqual([2, 2, 2, 1, 0, 0]);
  });

  it("does not touch a chord that never used the low string", () => {
    expect(retuneShape(chordShapes["D Major"][0], DROP_D_TUNING).frets).toEqual([-1, -1, 0, 2, 3, 2]);
  });

  it("drops the low string rather than asking for a stretch", () => {
    expect(retuneShape(chordShapes["G Major"][0], DROP_D_TUNING).frets).toEqual([-1, 2, 0, 0, 3, 3]);
  });

  it("keeps the stretch when the low string holds the only copy of a chord tone", () => {
    expect(retuneShape(chordShapes["G Maj9"][0], DROP_D_TUNING).frets).toEqual([5, 0, 0, 2, 0, 2]);
  });
});

describe("getNeckVoicings in drop D", () => {
  it("offers the same kinds of voicing, sounding the same chord", () => {
    for (const root of sharpNotes) {
      for (const type of TYPE_GROUPS.flatMap((g) => g.types as readonly string[])) {
        const standard = getNeckVoicings(root, type);
        const dropped = getNeckVoicings(root, type, DROP_D_TUNING);
        expect(new Set(dropped.map((v) => v.label)), `${root} ${type}`).toEqual(new Set(standard.map((v) => v.label)));

        for (const voicing of dropped) {
          const twin = standard.find((v) => v.id === voicing.id);
          if (!twin) continue;
          expect(pitchClasses(voicing.shape, DROP_D_TUNING.midi), `${root} ${type} ${voicing.id}`).toEqual(
            pitchClasses(twin.shape, STANDARD_TUNING.midi)
          );
        }
      }
    }
  });
});

describe("triadVoicings in drop D", () => {
  it("spells the chord with the right note on the bottom on every string set", () => {
    const intervals = [0, 4, 7];
    for (const [rootIndex, root] of sharpNotes.entries()) {
      // sharpNotes starts at A, which is pitch class 9.
      const tones = intervals.map((n) => (9 + rootIndex + n) % 12);
      const voicings = triadVoicings(root, intervals, DROP_D_TUNING);

      // The sets that never touch the low string cannot change. Strings 6-5-4 can
      // lose shapes: the wider gap to the D string pushes some past a hand's reach.
      const offLowString = (v: TriadVoicing) => v.stringSet !== TRIAD_STRING_SETS[0].key;
      expect(voicings.filter(offLowString), root).toEqual(triadVoicings(root, intervals).filter(offLowString));
      expect(voicings.filter((v) => !offLowString(v)).length, root).toBeGreaterThan(0);

      for (const v of voicings) {
        const sounded = pitches(v.shape, DROP_D_TUNING.midi).filter((p): p is number => p !== null);
        expect([...sounded.map((p) => p % 12)].sort((a, b) => a - b), `${root} ${v.id}`).toEqual(
          [...tones].sort((a, b) => a - b)
        );
        const bottom = tones[v.inversion === "root" ? 0 : v.inversion === "first" ? 1 : 2];
        expect(sounded[0] % 12, `${root} ${v.id}`).toBe(bottom);
      }
    }
  });
});

describe("tuningById", () => {
  it("falls back to standard for anything it does not know", () => {
    expect(tuningById("drop-d")).toBe(DROP_D_TUNING);
    expect(tuningById("")).toBe(STANDARD_TUNING);
    expect(tuningById(undefined)).toBe(STANDARD_TUNING);
  });
});
