import { describe, expect, it } from "vitest";
import {
  PROGRESSION_GROUPS,
  filterGroupsByKeyMode,
  keyModeForChordType,
  noteAtDegree,
  parseRomanPattern,
  progressionKeyMode,
} from "./chordProgressions";

const all = PROGRESSION_GROUPS.flatMap((g) => g.items);
const genres = PROGRESSION_GROUPS.filter((g) => g.label.startsWith("Genre"));

describe("progression catalog", () => {
  it("has unique names, since a progression is selected by name", () => {
    const names = all.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("writes every chord as a numeral the parser understands", () => {
    const token = /^[b#]?(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)°?$/;
    for (const p of all) {
      for (const t of p.pattern.split(/[–-]/)) expect(t.trim(), p.name).toMatch(token);
    }
  });

  it("covers the requested genres", () => {
    const labels = genres.map((g) => g.label);
    for (const g of ["Pop", "Rock", "Pop Punk", "Punk", "Folk", "Country"]) {
      expect(labels).toContain(`Genre · ${g}`);
    }
  });
});

describe("key mode", () => {
  it("reads a lowercase i tonic as minor", () => {
    expect(progressionKeyMode("i–VI–III–VII")).toBe("minor");
    expect(progressionKeyMode("vi–IV–I–V")).toBe("major");
    expect(progressionKeyMode("ii°–V–i")).toBe("minor");
  });

  it("maps chord types to a key", () => {
    for (const t of ["Minor", "m7", "mMaj7", "m6", "m9", "m11"]) expect(keyModeForChordType(t)).toBe("minor");
    for (const t of ["Major", "Maj7", "7", "Sus2", "Sus4", "Add9", "6", "9", "Maj9", "13", "Maj13"]) {
      expect(keyModeForChordType(t)).toBe("major");
    }
  });

  it("filters to one mode and drops empty groups", () => {
    for (const mode of ["major", "minor"] as const) {
      const groups = filterGroupsByKeyMode(PROGRESSION_GROUPS, mode);
      expect(groups.length).toBeGreaterThan(0);
      for (const g of groups) {
        expect(g.items.length).toBeGreaterThan(0);
        for (const p of g.items) expect(progressionKeyMode(p.pattern)).toBe(mode);
      }
    }
  });

  it("spells A minor's minor-key loop as Am F C G", () => {
    const chords = parseRomanPattern("i–VI–III–VII").map((c) => `${noteAtDegree("A", c.degree, false)}${c.quality === "Minor" ? "m" : ""}`);
    expect(chords).toEqual(["Am", "F", "C", "G"]);
  });
});
