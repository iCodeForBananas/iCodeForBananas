import { asSectionHeader, isChordName } from "./songText";
import { transposeChord } from "../lib/transpose";
import type { Section } from "./shared";

// ─── Chord progressions ───────────────────────────────────────────────────────
//
// The chords a song already carries, read as something to play rather than
// something to look at. A lead sheet spells them inline — [G]Amazing [C]grace —
// so the progression is right there in the order it's played; all this does is
// pick the section worth looping and turn each symbol into notes.

const NOTE_SEMITONE: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
  "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

export interface Chord {
  /** The symbol as written, after any transposition — what the badge shows. */
  symbol: string;
  /** Semitone of the root, 0 = C. */
  root: number;
  /** Semitones above the root, the root itself included. */
  intervals: number[];
  /** Semitone of the bass note a slash chord names, when it names one. */
  bass: number | null;
}

const MAJOR = [0, 4, 7];
const MINOR = [0, 3, 7];

/**
 * What the letters after the root mean, in the grammar the sheet's own parser
 * accepts (see CHORD_RE in songText.ts): a quality word and a number, either of
 * which can be missing. Anything unrecognised falls back to the plain triad,
 * since a chord that plays as a major is a better answer than one that doesn't
 * play at all.
 */
function qualityIntervals(word: string, digits: string): number[] {
  const w = word.toLowerCase();
  const n = digits;
  const minor = w === "m" || w === "min";

  if (w === "sus") return n === "2" ? [0, 2, 7] : [0, 5, 7];
  if (w === "dim") return n === "7" ? [0, 3, 6, 9] : [0, 3, 6];
  if (w === "aug") return n === "7" ? [0, 4, 8, 10] : [0, 4, 8];
  if (w === "add") return n === "9" ? [...MAJOR, 14] : n === "4" ? [0, 4, 5, 7] : MAJOR;
  if (w === "maj") return n === "9" ? [...MAJOR, 11, 14] : n === "7" ? [...MAJOR, 11] : MAJOR;

  const base = minor ? MINOR : MAJOR;
  if (n === "5" && !minor) return [0, 7];
  if (n === "6") return [...base, 9];
  if (n === "7") return [...base, 10];
  if (n === "9") return [...base, 10, 14];
  return base;
}

/** A chord symbol as notes, or null when it isn't one. */
export function parseChordSymbol(symbol: string): Chord | null {
  const trimmed = symbol.trim();
  const m = trimmed.match(/^([A-G][b#]?)([A-Za-z]*)(\d*)(?:\/([A-G][b#]?))?$/);
  if (!m) return null;
  const root = NOTE_SEMITONE[m[1]];
  if (root === undefined) return null;
  const bass = m[4] ? NOTE_SEMITONE[m[4]] ?? null : null;
  return { symbol: trimmed, root, intervals: qualityIntervals(m[2], m[3]), bass };
}

/** The chord a song's key names, for a sheet that spells out no chords at all. */
export function chordFromKey(key: string | null | undefined): Chord | null {
  const m = key?.trim().match(/^([A-G][b#]?)(m?)$/i);
  if (!m) return null;
  const root = NOTE_SEMITONE[m[1]];
  if (root === undefined) return null;
  return { symbol: m[1] + m[2], root, intervals: m[2] ? MINOR : MAJOR, bass: null };
}

/** Every inline [chord] in a block of text, in the order it's played. */
export function chordSymbolsIn(text: string): string[] {
  const found: string[] = [];
  for (const line of text.split("\n")) {
    // A standalone [Chorus] is a label, not something to play.
    if (asSectionHeader(line) !== null) continue;
    for (const m of line.matchAll(/\[([^[\]]*)\]/g)) {
      const inner = m[1].trim();
      if (isChordName(inner)) found.push(inner);
    }
  }
  return found;
}

/** Long enough to be the song, short enough to still read as a loop. */
const MAX_CHORDS = 16;

/**
 * The progression to play along with. The chorus is where a song states its
 * changes plainly and it's the part already in the ear of anyone playing along,
 * so it wins; failing that, the first section that spells any chords does.
 *
 * `transposeSteps` follows the sheet on screen — the pads have to be in the key
 * the reader is looking at, not the one the file was written in.
 */
export function progressionFrom(sections: Section[], transposeSteps = 0): Chord[] {
  const spelled = sections
    .map((section) => ({ section, symbols: chordSymbolsIn(section.content ?? "") }))
    .filter((found) => found.symbols.length > 0);
  if (!spelled.length) return [];

  const pick = spelled.find((found) => found.section.type === "chorus") ?? spelled[0];

  return pick.symbols
    .slice(0, MAX_CHORDS)
    .map((symbol) =>
      parseChordSymbol(transposeSteps ? transposeChord(symbol, transposeSteps) : symbol)
    )
    .filter((chord): chord is Chord => chord !== null);
}
