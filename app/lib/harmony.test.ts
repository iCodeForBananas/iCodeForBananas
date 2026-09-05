import { describe, expect, it } from "vitest";
import {
  formatChord,
  formatKey,
  formatNote,
  keyPrefersFlats,
  parseChord,
  parseKey,
  readChordInView,
  shapeKey,
  soundingKey,
  shapeOffset,
  transposeChord,
  transposeKey,
  type Key,
} from "./harmony";

const key = (text: string): Key => {
  const parsed = parseKey(text);
  if (!parsed) throw new Error(`not a key: ${text}`);
  return parsed;
};

describe("keys", () => {
  it("reads the ordinary spellings", () => {
    expect(parseKey("G")).toEqual({ pitchClass: 7, minor: false });
    expect(parseKey("Bb")).toEqual({ pitchClass: 10, minor: false });
    expect(parseKey("F#m")).toEqual({ pitchClass: 6, minor: true });
    expect(parseKey("Am")).toEqual({ pitchClass: 9, minor: true });
    expect(parseKey("C minor")).toEqual({ pitchClass: 0, minor: true });
  });

  it("reads the theoretical spellings people actually write", () => {
    expect(parseKey("Cb")).toEqual({ pitchClass: 11, minor: false });
    expect(parseKey("E#")).toEqual({ pitchClass: 5, minor: false });
    expect(parseKey("Fb")).toEqual({ pitchClass: 4, minor: false });
    expect(parseKey("B#")).toEqual({ pitchClass: 0, minor: false });
  });

  it("rejects what is not a key", () => {
    for (const text of ["", "H", "Chorus", "G7", "Gmaj", "8"]) {
      expect(parseKey(text)).toBeNull();
    }
  });

  it("writes each key under the name it is normally written under", () => {
    // Cb major is a real key with seven flats, but nobody charts in it.
    expect(formatKey(key("Cb"))).toBe("B");
    expect(formatKey(key("B#"))).toBe("C");
    expect(formatKey(key("Fb"))).toBe("E");
    expect(formatKey(key("G"))).toBe("G");
    expect(formatKey(key("Ebm"))).toBe("Ebm");
  });

  it("never lands in a key with more accidentals than exist", () => {
    // Every key reachable by transposition has to be one someone can read.
    const PLAYABLE = new Set([
      "C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B",
      "Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "Bbm", "Bm",
    ]);
    for (const start of ["C", "F#", "Bb", "Am", "Ebm"]) {
      for (let steps = -12; steps <= 12; steps++) {
        expect(PLAYABLE).toContain(formatKey(transposeKey(key(start), steps)));
      }
    }
  });

  it("knows which keys are written with flats", () => {
    // F has no flat in its name and one flat in its signature, so this cannot
    // be read off the spelling.
    expect(keyPrefersFlats(key("F"))).toBe(true);
    expect(keyPrefersFlats(key("Dm"))).toBe(true);
    expect(keyPrefersFlats(key("Bb"))).toBe(true);
    expect(keyPrefersFlats(key("G"))).toBe(false);
    expect(keyPrefersFlats(key("C"))).toBe(false);
    expect(keyPrefersFlats(key("Am"))).toBe(false);
    // Relative keys do not have to agree: C major has no accidentals, C minor
    // has three flats.
    expect(keyPrefersFlats(key("Cm"))).toBe(true);
  });

  it("spells the same pitch differently depending on the key", () => {
    expect(formatNote(10, key("F"))).toBe("Bb");
    expect(formatNote(10, key("B"))).toBe("A#");
    expect(formatNote(6, key("D"))).toBe("F#");
    expect(formatNote(6, key("Ab"))).toBe("Gb");
    expect(formatNote(3, null)).toBe("D#");
  });
});

describe("chords", () => {
  it("keeps the quality whatever it is", () => {
    for (const token of ["C", "Am7", "F#maj7", "Csus4", "C7sus4", "Cm7b5", "Cmaj7#11"]) {
      expect(formatChord(parseChord(token)!, key("C"))).toBe(token);
    }
  });

  it("separates a bass note from a slash degree", () => {
    expect(parseChord("D/F#")).toMatchObject({ bassPitchClass: 6, slashDegree: null });
    expect(parseChord("C6/9")).toMatchObject({ bassPitchClass: null, slashDegree: "9" });
  });

  it("moves a bass note but not a degree", () => {
    expect(formatChord(transposeChord(parseChord("D/F#")!, 2), key("E"))).toBe("E/G#");
    expect(formatChord(transposeChord(parseChord("C6/9")!, 2), key("D"))).toBe("D6/9");
  });

  it("rejects what is not a chord", () => {
    for (const token of ["", "Hm", "N.C.", "%", "8"]) expect(parseChord(token)).toBeNull();
  });
});

describe("transposition and capo are separate transforms", () => {
  const written = key("Eb");

  it("neither one changes the song's declared key", () => {
    const before = { ...written };
    soundingKey(written, { transpose: 3, capo: 2 });
    shapeKey(written, { transpose: 3, capo: 2 });
    readChordInView("Eb", written, { transpose: 3, capo: 2 });
    expect(written).toEqual(before);
  });

  it("a capo does not change what key the song is in", () => {
    for (const capo of [0, 1, 2, 3, 5, 7]) {
      expect(formatKey(soundingKey(written, { transpose: 0, capo }))).toBe("Eb");
    }
  });

  it("transposing does change what key the song is in", () => {
    expect(formatKey(soundingKey(written, { transpose: 2, capo: 0 }))).toBe("F");
    expect(formatKey(soundingKey(written, { transpose: -3, capo: 0 }))).toBe("C");
  });

  it("a capo changes only the shapes you finger", () => {
    // Eb with a capo on 1 is fingered in D and still sounds in Eb.
    const view = { transpose: 0, capo: 1 };
    expect(formatKey(soundingKey(written, view))).toBe("Eb");
    expect(formatKey(shapeKey(written, view))).toBe("D");
    expect(readChordInView("Eb", written, view)).toBe("D");
    expect(readChordInView("Ab", written, view)).toBe("G");
    expect(readChordInView("Cm", written, view)).toBe("Bm");
  });

  it("spells the shapes for the key the hands are in, not the key on the chart", () => {
    // Eb is a flat key; the D shapes it becomes under a capo want sharps.
    const view = { transpose: 0, capo: 1 };
    expect(readChordInView("Bb", written, view)).toBe("A");
    expect(readChordInView("Gm", written, view)).toBe("F#m");
    // Without the capo the same chord stays flat.
    expect(readChordInView("Gm", written, { transpose: 0, capo: 0 })).toBe("Gm");
  });

  it("composes the two without confusing them", () => {
    const view = { transpose: 2, capo: 2 };
    expect(shapeOffset(view)).toBe(0);
    // Up two with a capo on two: sounds in F, fingered in the original Eb.
    expect(formatKey(soundingKey(written, view))).toBe("F");
    expect(formatKey(shapeKey(written, view))).toBe("Eb");
    expect(readChordInView("Eb", written, view)).toBe("Eb");
  });

  it("a capo of n is the same shapes as transposing down n", () => {
    for (let capo = 0; capo <= 7; capo++) {
      const withCapo = readChordInView("Eb", written, { transpose: 0, capo });
      const byTransposing = readChordInView("Eb", written, { transpose: -capo, capo: 0 });
      // The shapes match; only the key the chart reports differs.
      expect(formatKey(shapeKey(written, { transpose: 0, capo }))).toBe(
        formatKey(soundingKey(written, { transpose: -capo, capo: 0 }))
      );
      expect(withCapo).toBe(byTransposing);
    }
  });
});

describe("enharmonic spelling follows the target key", () => {
  it("picks flats or sharps by where it lands, not which way it went", () => {
    // Up one from G is Ab, a flat key, so the chords are flat. The old
    // direction heuristic would have produced sharps for an upward move.
    expect(readChordInView("G", key("G"), { transpose: 1, capo: 0 })).toBe("Ab");
    expect(readChordInView("C", key("G"), { transpose: 1, capo: 0 })).toBe("Db");
    // Down one from Bb is A, a sharp key, so the chords are sharp. The old
    // heuristic would have produced flats for a downward move.
    expect(readChordInView("D", key("Bb"), { transpose: -1, capo: 0 })).toBe("C#");
  });

  it("keeps a whole progression in one spelling", () => {
    const from = key("C");
    const view = { transpose: 3, capo: 0 };
    expect(formatKey(soundingKey(from, view))).toBe("Eb");
    expect(["C", "Am", "F", "G"].map((c) => readChordInView(c, from, view)))
      .toEqual(["Eb", "Cm", "Ab", "Bb"]);
  });

  it("does not produce a double accidental at any distance", () => {
    for (const start of ["C", "F#", "Bb", "B", "Db"]) {
      for (let steps = -12; steps <= 12; steps++) {
        for (const chord of ["C", "F#m7", "Bb/D", "E7"]) {
          const out = readChordInView(chord, key(start), { transpose: steps, capo: 0 });
          expect(out).not.toMatch(/[A-G](##|bb)/);
        }
      }
    }
  });

  it("round-trips back to where it started", () => {
    for (const start of ["C", "G", "Eb", "F#", "Bbm"]) {
      for (let steps = -11; steps <= 11; steps++) {
        const there = readChordInView("Am7", key(start), { transpose: steps, capo: 0 });
        const back = readChordInView(there, transposeKey(key(start), steps), {
          transpose: -steps,
          capo: 0,
        });
        expect(back).toBe("Am7");
      }
    }
  });

  it("leaves a chord alone when nothing is asked of it", () => {
    expect(readChordInView("F#m7/C#", key("D"), { transpose: 0, capo: 0 })).toBe("F#m7/C#");
    expect(readChordInView("Chorus", key("D"), { transpose: 2, capo: 0 })).toBe("Chorus");
  });
});
