import { describe, it, expect } from "vitest";
import {
  CARDS,
  CARD_BY_ID,
  DOLCH_FIRST,
  DOLCH_NOUNS,
  DOLCH_PRE_PRIMER,
  DOLCH_PRIMER,
  DOLCH_SECOND,
  DOLCH_THIRD,
  GRADES,
  LEVELS,
  countSyllables,
  tokenize,
} from "./wordClimbContent";

/** Regular endings are taught from Grade 1, so a known base covers them there. */
function isKnown(word: string, known: Set<string>, allowEndings: boolean): boolean {
  if (known.has(word)) return true;
  if (word.endsWith("'s") && known.has(word.slice(0, -2))) return true;
  if (!allowEndings) return false;
  const stems: string[] = [];
  for (const ending of ["s", "es", "ed", "ing", "d"]) {
    if (!word.endsWith(ending)) continue;
    const stem = word.slice(0, -ending.length);
    stems.push(stem, `${stem}e`);
    if (/(.)\1$/.test(stem)) stems.push(stem.slice(0, -1));
  }
  if (word.endsWith("ies") || word.endsWith("ied")) stems.push(`${word.slice(0, -3)}y`);
  return stems.some((stem) => known.has(stem));
}

describe("Dolch lists", () => {
  it("has the published count at every level", () => {
    expect(DOLCH_PRE_PRIMER).toHaveLength(40);
    expect(DOLCH_PRIMER).toHaveLength(52);
    expect(DOLCH_FIRST).toHaveLength(41);
    expect(DOLCH_SECOND).toHaveLength(46);
    expect(DOLCH_THIRD).toHaveLength(41);
    expect(DOLCH_NOUNS).toHaveLength(95);
  });

  it("puts every Dolch word on a card exactly once", () => {
    const wordCards = CARDS.filter((card) => card.kind === "word").map((card) => card.text);
    const all = [...DOLCH_PRE_PRIMER, ...DOLCH_PRIMER, ...DOLCH_FIRST, ...DOLCH_SECOND, ...DOLCH_THIRD, ...DOLCH_NOUNS];
    expect(new Set(all).size).toBe(315);
    for (const word of all) expect(wordCards.filter((text) => text === word)).toEqual([word]);
  });
});

describe("the ladder", () => {
  it("runs kindergarten through third grade, in order", () => {
    expect(GRADES).toEqual(["Kindergarten", "Grade 1", "Grade 2", "Grade 3"]);
  });

  it("starts on single words", () => {
    expect(LEVELS[0].kind).toBe("word");
    expect(CARDS[0].words).toBe(1);
  });

  it("gives every card a unique id and a unique level id", () => {
    expect(CARD_BY_ID.size).toBe(CARDS.length);
    expect(new Set(LEVELS.map((level) => level.id)).size).toBe(LEVELS.length);
  });

  it("keeps every card inside its level's word bounds", () => {
    for (const card of CARDS) {
      const level = LEVELS[card.levelIndex];
      expect(card.words, card.text).toBeGreaterThanOrEqual(level.minWords);
      expect(card.words, card.text).toBeLessThanOrEqual(level.maxWords);
    }
  });

  it.each(["phrase", "sentence"] as const)("never gets shorter from one %s level to the next", (kind) => {
    const levels = LEVELS.filter((level) => level.kind === kind);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i].maxWords, levels[i].id).toBeGreaterThanOrEqual(levels[i - 1].maxWords);
    }
  });

  it("orders each level easiest first", () => {
    for (let i = 1; i < CARDS.length; i++) {
      const [a, b] = [CARDS[i - 1], CARDS[i]];
      if (a.levelIndex === b.levelIndex) expect(a.words, b.text).toBeLessThanOrEqual(b.words);
    }
  });

  it("only uses words the child has already been taught", () => {
    const known = new Set<string>();
    const problems: string[] = [];
    for (const level of LEVELS) {
      const allowEndings = level.grade !== "Kindergarten";
      if (level.kind === "word") {
        for (const text of level.texts) for (const word of tokenize(text)) known.add(word);
        continue;
      }
      const allowed = new Set([...known, ...(level.extraWords ?? [])]);
      for (const text of level.texts) {
        for (const word of tokenize(text)) {
          if (!isKnown(word, allowed, allowEndings)) problems.push(`${level.id}: "${word}" in "${text}"`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("writes sentences as sentences", () => {
    for (const card of CARDS.filter((c) => c.kind === "sentence")) {
      expect(card.text, card.text).toMatch(/^[A-Z].*[.?!]$/);
    }
  });
});

describe("countSyllables", () => {
  it.each([
    ["a", 1], ["the", 1], ["make", 1], ["jumped", 1], ["wanted", 2], ["likes", 1], ["boxes", 2], ["little", 2], ["table", 2], ["yellow", 2],
    ["every", 2], ["going", 2], ["school", 1], ["squirrel", 2], ["because", 2], ["together", 3], ["butterfly", 3], ["library", 3], ["beautiful", 3], ["dog's", 1], ["don't", 1],
  ])("%s has %i", (word, expected) => {
    expect(countSyllables(word)).toBe(expected);
  });
});
