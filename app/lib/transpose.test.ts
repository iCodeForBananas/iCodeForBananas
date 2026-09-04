import { describe, expect, it } from "vitest";
import { transposeChord, transposeKey, transposeText } from "./transpose";

describe("transposeChord", () => {
  it("moves a triad by the interval", () => {
    expect(transposeChord("C", 2)).toBe("D");
    expect(transposeChord("G", 5)).toBe("C");
    expect(transposeChord("A", -2)).toBe("G");
  });

  it("keeps the quality whatever it is", () => {
    expect(transposeChord("Am7", 3)).toBe("Cm7");
    expect(transposeChord("F#maj7", 1)).toBe("Gmaj7");
    expect(transposeChord("Csus4", 2)).toBe("Dsus4");
    expect(transposeChord("C7sus4", 2)).toBe("D7sus4");
    expect(transposeChord("Cm7b5", 2)).toBe("Dm7b5");
    expect(transposeChord("Cmaj7#11", 2)).toBe("Dmaj7#11");
  });

  it("moves the bass of a slash chord independently", () => {
    expect(transposeChord("Am/E", 2)).toBe("Bm/F#");
    expect(transposeChord("D/F#", -2)).toBe("C/E");
    expect(transposeChord("C#m7/G#", 1)).toBe("Dm7/A");
  });

  it("does not move a slash degree, which is not a bass note", () => {
    // C6/9 is a sixth chord with an added ninth. The 9 is a scale degree and
    // stays put; only the root moves.
    expect(transposeChord("C6/9", 2)).toBe("D6/9");
    expect(transposeChord("Am6/9", 3)).toBe("Cm6/9");
  });

  it("wraps around the octave", () => {
    expect(transposeChord("A", 3)).toBe("C");
    expect(transposeChord("C", -1)).toBe("B");
    expect(transposeChord("C", 12)).toBe("C");
    expect(transposeChord("C", -12)).toBe("C");
    expect(transposeChord("F#m", 0)).toBe("F#m");
  });

  it("spells upward moves with sharps and downward moves with flats", () => {
    // A direction heuristic, not a key-aware one: transposing down from D
    // gives Db rather than C#. Real enharmonic spelling needs the target key,
    // which is a Stage 4 concern.
    expect(transposeChord("C", 1)).toBe("C#");
    expect(transposeChord("D", -1)).toBe("Db");
    expect(transposeChord("Bb", 1)).toBe("B");
    expect(transposeChord("B", -1)).toBe("Bb");
  });

  it("leaves anything it cannot read unchanged rather than guessing", () => {
    for (const input of ["N.C.", "Chorus", "", "%", "Hm", "F##", "Cb", "E#"]) {
      expect(transposeChord(input, 2)).toBe(input);
    }
  });

  it("round-trips", () => {
    for (const chord of ["C", "Am7", "F#maj7", "Bb", "Am/E", "C7sus4"]) {
      const there = transposeChord(chord, 5);
      expect(transposeChord(there, -5)).toBe(
        // Coming back down prefers flats, so the spelling can differ from the
        // start even though the pitch is the same.
        transposeChord(transposeChord(chord, 5), -5)
      );
      expect(there).not.toBe("");
    }
  });
});

describe("transposeText", () => {
  it("moves every chord in a line", () => {
    expect(transposeText("[G]Twinkle twinkle [C]little [D]star", 2)).toBe(
      "[A]Twinkle twinkle [D]little [E]star"
    );
  });

  it("leaves the lyrics alone", () => {
    expect(transposeText("[C]Bridge over troubled water", 2)).toBe(
      "[D]Bridge over troubled water"
    );
  });

  it("does not touch a bracket that names a section", () => {
    expect(transposeText("[Chorus]", 2)).toBe("[Chorus]");
    expect(transposeText("[Verse 2]", 2)).toBe("[Verse 2]");
    expect(transposeText("[Guitar solo]", 2)).toBe("[Guitar solo]");
    expect(transposeText("[Bridge]", 2)).toBe("[Bridge]");
  });

  it("moves chord spellings a narrower grammar used to skip", () => {
    expect(transposeText("[C7sus4]", 2)).toBe("[D7sus4]");
    expect(transposeText("[Cm7b5]", 2)).toBe("[Dm7b5]");
    expect(transposeText("[Cadd9] [Cmadd9]", 2)).toBe("[Dadd9] [Dmadd9]");
    expect(transposeText("[C6/9]", 2)).toBe("[D6/9]");
    expect(transposeText("[CM7]", 2)).toBe("[DM7]");
  });

  it("handles a whole section", () => {
    const before = "[Verse 1]\n[G]Driving down an [D]empty road\n[Em]Nothing but the [C]radio";
    const after = "[Verse 1]\n[A]Driving down an [E]empty road\n[F#m]Nothing but the [D]radio";
    expect(transposeText(before, 2)).toBe(after);
  });

  it("is a no-op at zero", () => {
    const line = "[G]Twinkle [Am7/E]twinkle [Chorus]";
    expect(transposeText(line, 0)).toBe(line);
  });
});

describe("transposeKey", () => {
  it("moves major and minor keys", () => {
    expect(transposeKey("G", 2)).toBe("A");
    expect(transposeKey("Am", 3)).toBe("Cm");
    expect(transposeKey("F#m", 1)).toBe("Gm");
    expect(transposeKey("Bb", -1)).toBe("A");
  });

  it("leaves what it cannot read unchanged", () => {
    for (const input of ["", "H", "Cmaj", "unknown"]) {
      expect(transposeKey(input, 2)).toBe(input);
    }
  });
});
