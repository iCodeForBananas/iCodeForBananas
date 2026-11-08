import { describe, expect, it } from "vitest";
import { aShapeTemplates, chordShapes, eShapeTemplates, sharpNotes, type ChordShape } from "./chordShapes";
import { getNeckVoicings, getVoicings, TYPE_GROUPS } from "./chordVoicings";
import { TRIAD_STRING_SETS, triadVoicings, type TriadVoicing } from "./triads";
import {
  DROP_D_TUNING,
  OPEN_E_TUNING,
  OPEN_G_TUNING,
  retuneShape,
  STANDARD_TUNING,
  tuningById,
  TUNINGS,
} from "./tunings";

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

const everyType = TYPE_GROUPS.flatMap((g) => g.types as readonly string[]);
const openTunings = [OPEN_G_TUNING, OPEN_E_TUNING];

describe("retuneShape", () => {
  it("leaves shapes alone in standard tuning", () => {
    for (const [, shape] of everyShape) {
      expect(retuneShape(shape, STANDARD_TUNING)?.frets).toEqual(shape.frets);
    }
  });

  it("keeps every chord's notes in drop D, on every string it still plays", () => {
    for (const [name, shape] of everyShape) {
      const retuned = retuneShape(shape, DROP_D_TUNING)!;
      expect(pitchClasses(retuned, DROP_D_TUNING.midi), name).toEqual(pitchClasses(shape, STANDARD_TUNING.midi));

      const before = pitches(shape, STANDARD_TUNING.midi);
      pitches(retuned, DROP_D_TUNING.midi).forEach((pitch, i) => {
        if (pitch !== null) expect(pitch, name).toBe(before[i]);
      });
    }
  });

  it("frets the low string two higher when the hand is already there", () => {
    expect(retuneShape(chordShapes["F Major"][0], DROP_D_TUNING)?.frets).toEqual([3, 3, 3, 2, 1, 1]);
    expect(retuneShape(chordShapes["E Major"][0], DROP_D_TUNING)?.frets).toEqual([2, 2, 2, 1, 0, 0]);
  });

  it("does not touch a chord that never used the low string", () => {
    expect(retuneShape(chordShapes["D Major"][0], DROP_D_TUNING)?.frets).toEqual([-1, -1, 0, 2, 3, 2]);
  });

  it("drops the low string rather than asking for a stretch", () => {
    expect(retuneShape(chordShapes["G Major"][0], DROP_D_TUNING)?.frets).toEqual([-1, 2, 0, 0, 3, 3]);
  });

  it("keeps the stretch when the low string holds the only copy of a chord tone", () => {
    expect(retuneShape(chordShapes["G Maj9"][0], DROP_D_TUNING)?.frets).toEqual([5, 0, 0, 2, 0, 2]);
  });

  it.each(openTunings)("only returns shapes that spell the chord and fit the hand in $name", (tuning) => {
    for (const [name, shape] of everyShape) {
      const retuned = retuneShape(shape, tuning);
      if (!retuned) continue;
      expect(pitchClasses(retuned, tuning.midi), name).toEqual(pitchClasses(shape, STANDARD_TUNING.midi));

      const fretted = retuned.frets.filter((fret) => fret > 0);
      if (fretted.length) expect(Math.max(...fretted) - Math.min(...fretted), name).toBeLessThanOrEqual(4);
    }
  });

  it("turns the open E chord into the open strings of Open E", () => {
    expect(retuneShape(chordShapes["E Major"][0], OPEN_E_TUNING)?.frets).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("refuses a shape it cannot complete rather than drawing the wrong chord", () => {
    expect(retuneShape(chordShapes["Bb Maj7"][0], OPEN_E_TUNING)).toBeNull();
  });
});

describe("getNeckVoicings in other tunings", () => {
  it("offers the same kinds of voicing in drop D, sounding the same chord", () => {
    for (const root of sharpNotes) {
      for (const type of everyType) {
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

  it("always has at least one way to play every chord, in every tuning", () => {
    const unplayable = TUNINGS.flatMap((tuning) =>
      sharpNotes.flatMap((root) =>
        everyType
          .filter((type) => getVoicings(root, type, tuning).length === 0)
          .map((type) => `${tuning.name}: ${root} ${type}`)
      )
    );
    expect(unplayable).toEqual([]);
  });

  it("offers a one-finger barre for major chords in open tunings", () => {
    const barre = (root: string, tuning = OPEN_G_TUNING) =>
      getNeckVoicings(root, "Major", tuning).find((v) => v.label === "Full Barre")?.shape.frets;

    expect(barre("G")).toEqual([0, 0, 0, 0, 0, 0]);
    expect(barre("A")).toEqual([2, 2, 2, 2, 2, 2]);
    expect(barre("A", OPEN_E_TUNING)).toEqual([5, 5, 5, 5, 5, 5]);
  });

  it("offers no barre where the strings do not ring a major chord", () => {
    expect(getNeckVoicings("G", "Minor", OPEN_G_TUNING).some((v) => v.label === "Full Barre")).toBe(false);
    expect(getNeckVoicings("G", "Major", DROP_D_TUNING).some((v) => v.label === "Full Barre")).toBe(false);
  });
});

describe("triadVoicings in other tunings", () => {
  const intervals = [0, 4, 7];

  // sharpNotes starts at A, which is pitch class 9.
  const tonesOf = (rootIndex: number) => intervals.map((n) => (9 + rootIndex + n) % 12);

  it.each(TUNINGS)("spells the chord with the right note on the bottom in $name", (tuning) => {
    for (const [rootIndex, root] of sharpNotes.entries()) {
      const tones = tonesOf(rootIndex);
      for (const v of triadVoicings(root, intervals, tuning)) {
        const sounded = pitches(v.shape, tuning.midi).filter((p): p is number => p !== null);
        expect([...sounded.map((p) => p % 12)].sort((a, b) => a - b), `${root} ${v.id}`).toEqual(
          [...tones].sort((a, b) => a - b)
        );
        const bottom = tones[v.inversion === "root" ? 0 : v.inversion === "first" ? 1 : 2];
        expect(sounded[0] % 12, `${root} ${v.id}`).toBe(bottom);
      }
    }
  });

  it("only changes the low string set in drop D", () => {
    // Strings 6-5-4 can lose shapes: the wider gap to the D string pushes some
    // past a hand's reach.
    const offLowString = (v: TriadVoicing) => v.stringSet !== TRIAD_STRING_SETS[0].key;
    for (const root of sharpNotes) {
      const voicings = triadVoicings(root, intervals, DROP_D_TUNING);
      expect(voicings.filter(offLowString), root).toEqual(triadVoicings(root, intervals).filter(offLowString));
      expect(voicings.filter((v) => !offLowString(v)).length, root).toBeGreaterThan(0);
    }
  });
});

describe("tuningById", () => {
  it("falls back to standard for anything it does not know", () => {
    expect(tuningById("drop-d")).toBe(DROP_D_TUNING);
    expect(tuningById("open-g")).toBe(OPEN_G_TUNING);
    expect(tuningById("")).toBe(STANDARD_TUNING);
    expect(tuningById(undefined)).toBe(STANDARD_TUNING);
  });
});
