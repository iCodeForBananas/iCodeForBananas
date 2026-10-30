import { describe, expect, it } from "vitest";
import { asSectionHeader, isChordName } from "./songText";

/**
 * This grammar answers the first question any reader of a song has: is `[Bm]` a
 * chord or the name of a part? Getting it wrong is visible immediately, because
 * a bracket that reads as a name becomes a section header, and one that reads
 * as a chord gets transposed.
 */
describe("isChordName", () => {
  const CHORDS = [
    // Triads and the plain qualities.
    "C", "Am", "F#m", "Bb", "Ebm", "G#", "Db",
    "Cmaj", "Cmin", "Cdim", "Caug", "Csus", "Csus2", "Csus4",
    // Sevenths and extensions.
    "C7", "Cm7", "Cmaj7", "CM7", "Cdim7", "Cm9", "Cmaj9", "C9", "C11", "C13",
    // Altered tones, which is where a naive grammar gives up.
    "Cm7b5", "C7b9", "C7#9", "C7#11", "Cmaj7#11",
    // Stacked qualities.
    "C7sus4", "Cadd9", "Cmadd9", "Csus2add9",
    // Sixths, including the slash-nine spelling that is not a bass note.
    "C6", "Cm6", "C6/9",
    // Slash chords.
    "C/E", "D/F#", "Am/E", "C#m7/G#", "Cm/Eb", "Bb/D", "Asus4/E",
  ];

  const NOT_CHORDS = [
    // Section names that start with a note letter, which is the whole trap.
    "Bridge", "Chorus", "Coda", "Break", "Bass", "Drums", "Ending", "End",
    "Fade", "Fade out", "Guitar", "Guitar solo", "Gtr", "Chords", "Build",
    "Groove", "Drop", "Backing vocals", "Acoustic", "Electric", "Ad lib",
    // Section names that do not start with a note letter.
    "Verse", "Verse 2", "Intro", "Outro", "Pre-Chorus", "Solo", "Instrumental",
    // Markers and prose.
    "N.C.", "x2", "repeat", "Am I Wrong", "",
  ];

  it.each(CHORDS)("reads %s as a chord", (input) => {
    expect(isChordName(input)).toBe(true);
  });

  it.each(NOT_CHORDS)("does not read %s as a chord", (input) => {
    expect(isChordName(input)).toBe(false);
  });
});

/**
 * The labels the editor itself generates. If the grammar ever widened far enough
 * to swallow one of these, that section would silently turn into a chord.
 */
describe("the app's own section labels are never chords", () => {
  const TYPES = ["intro", "verse", "pre-chorus", "chorus", "bridge", "outro", "other"];
  const LABELS = TYPES.flatMap((t) => {
    const base = t.charAt(0).toUpperCase() + t.slice(1);
    return [base, `${base} 2`, `${base} 10`];
  });

  it.each(LABELS)("%s", (label) => {
    expect(isChordName(label)).toBe(false);
  });
});

describe("asSectionHeader", () => {
  it("names a bracketed section", () => {
    expect(asSectionHeader("[Chorus]")).toBe("Chorus");
    expect(asSectionHeader("[Verse 2]")).toBe("Verse 2");
    expect(asSectionHeader("[ Bridge ]")).toBe("Bridge");
  });

  it("leaves a lone chord alone, however it is spelled", () => {
    for (const chord of ["[C]", "[Am]", "[F#m7]", "[C7sus4]", "[Cm7b5]", "[C6/9]"]) {
      expect(asSectionHeader(chord)).toBeNull();
    }
  });

  it("only treats a whole line as a header", () => {
    expect(asSectionHeader("[G]Twinkle twinkle")).toBeNull();
    expect(asSectionHeader("text before [Chorus]")).toBeNull();
    expect(asSectionHeader("[Chorus] text after")).toBeNull();
  });

  it("ignores lines with no brackets", () => {
    expect(asSectionHeader("Chorus")).toBeNull();
    expect(asSectionHeader("")).toBeNull();
  });
});
