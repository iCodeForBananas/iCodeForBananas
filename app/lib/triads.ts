import { flatToSharp, sharpNotes, type ChordShape } from "./chordShapes";

// ─── Triads ───────────────────────────────────────────────────────────────────
//
// A triad is the three notes a chord is built from, played on three adjacent
// strings and nothing else. Every chord on the guitar has a handful of these
// scattered up the neck, and finding them is the whole exercise: the same three
// notes, re-stacked and re-placed, so you can play a progression anywhere
// without moving your hand very far.
//
// These are worked out rather than written down. A hand-authored table can only
// ever cover the chord types someone got around to typing, at the positions they
// happened to choose; generating them means every triad-able chord is covered at
// every position it exists in, and the shapes come out identical to the ones a
// player would write by hand — the arithmetic of "the next chord tone above this
// one, on the next string" is what a guitarist is doing when they find these.

/** Standard tuning, as MIDI note numbers: E2 A2 D3 G3 B3 E4. */
const STRING_MIDI = [40, 45, 50, 55, 59, 64];

/**
 * The three-string groups triads are played on, low to high. Adjacent strings
 * only — that closeness is what makes a triad one grabbable shape rather than a
 * stretch, and it is the same vocabulary the Inversions panel uses.
 */
export const TRIAD_STRING_SETS = [
  { key: "5-4-3", label: "Strings 5-4-3", strings: [1, 2, 3] },
  { key: "4-3-2", label: "Strings 4-3-2", strings: [2, 3, 4] },
  { key: "3-2-1", label: "Strings 3-2-1", strings: [3, 4, 5] },
] as const;

/** Which note of the triad is on the bottom. */
export const TRIAD_INVERSIONS = [
  { key: "root", label: "Root Position", tooltip: "The note that names the chord is the lowest of the three" },
  { key: "first", label: "1st Inversion", tooltip: "The middle note of the chord is on the bottom — lighter, less settled" },
  { key: "second", label: "2nd Inversion", tooltip: "The fifth is on the bottom — open and floating, a good passing shape" },
] as const;

export type TriadInversion = (typeof TRIAD_INVERSIONS)[number]["key"];

/**
 * The triad inside a chord type.
 *
 * A seventh or an extended chord is a triad with more stacked on top, and the
 * triad underneath it is the part worth learning to move around — so those types
 * resolve to their own core rather than to nothing. `exact` says whether the
 * chord IS this triad or merely contains it, which is the difference between
 * "C Major" and "the C Major triad inside C Maj9".
 */
export interface TriadSpec {
  /** Semitones above the root, lowest first. Always three notes. */
  intervals: [number, number, number];
  /** What to call the triad on its own — "Major", "Sus4". */
  quality: string;
  /** True when the selected chord is exactly this triad, with nothing on top. */
  exact: boolean;
}

const MAJOR: [number, number, number] = [0, 4, 7];
const MINOR: [number, number, number] = [0, 3, 7];
const DIM: [number, number, number] = [0, 3, 6];
const AUG: [number, number, number] = [0, 4, 8];
const SUS2: [number, number, number] = [0, 2, 7];
const SUS4: [number, number, number] = [0, 5, 7];

const TRIAD_BY_TYPE: Record<string, { intervals: [number, number, number]; quality: string; exact: boolean }> = {
  Major: { intervals: MAJOR, quality: "Major", exact: true },
  Minor: { intervals: MINOR, quality: "Minor", exact: true },
  Diminished: { intervals: DIM, quality: "Diminished", exact: true },
  Augmented: { intervals: AUG, quality: "Augmented", exact: true },
  Sus2: { intervals: SUS2, quality: "Sus2", exact: true },
  Sus4: { intervals: SUS4, quality: "Sus4", exact: true },
  // Everything below is a triad with more stacked on top of it.
  Maj7: { intervals: MAJOR, quality: "Major", exact: false },
  "7": { intervals: MAJOR, quality: "Major", exact: false },
  m7: { intervals: MINOR, quality: "Minor", exact: false },
  Add9: { intervals: MAJOR, quality: "Major", exact: false },
  "6": { intervals: MAJOR, quality: "Major", exact: false },
  "9": { intervals: MAJOR, quality: "Major", exact: false },
  Maj9: { intervals: MAJOR, quality: "Major", exact: false },
  "13": { intervals: MAJOR, quality: "Major", exact: false },
  Maj13: { intervals: MAJOR, quality: "Major", exact: false },
};

/** The triad a chord type is built on, or null when it isn't built on one. */
export function triadSpecFor(type: string): TriadSpec | null {
  return TRIAD_BY_TYPE[type] ?? null;
}

/** How a scale degree reads, so a sus chord isn't described as having a third. */
const DEGREE_NAMES: Record<number, string> = {
  0: "1", 2: "2", 3: "♭3", 4: "3", 5: "4", 6: "♭5", 7: "5", 8: "♯5",
};

/** "1 – 3 – 5" for the triad, rotated into the order an inversion stacks them. */
export function degreeFormula(intervals: readonly number[], inversion: TriadInversion): string {
  const start = inversion === "root" ? 0 : inversion === "first" ? 1 : 2;
  return [0, 1, 2]
    .map((i) => DEGREE_NAMES[intervals[(start + i) % 3]] ?? "?")
    .join(" – ");
}

/** Semitone of a note name, 0 = C. Accepts either spelling. */
export function semitoneOf(note: string): number {
  const canonical = flatToSharp[note] ?? note;
  return (sharpNotes.indexOf(canonical) - sharpNotes.indexOf("C") + 12) % 12;
}

/**
 * Fingering for a three-note shape. Notes are numbered by which fret they are
 * on, lowest fret first, so two notes sharing a fret share a finger — that is a
 * small barre, which is how these shapes are actually held.
 */
function fingersFor(frets: number[]): number[] {
  const fretted = frets.filter((fret) => fret > 0);
  const ranks = [...new Set(fretted)].sort((a, b) => a - b);
  return frets.map((fret) => (fret > 0 ? Math.min(4, ranks.indexOf(fret) + 1) : 0));
}

export interface TriadVoicing {
  shape: ChordShape;
  inversion: TriadInversion;
  /** Which three strings it sits on — the key from TRIAD_STRING_SETS. */
  stringSet: string;
  /** Lowest fret a finger is asked for; 0 when the shape is all open strings. */
  startFret: number;
  /** Identity for a React key — stable across re-renders. */
  id: string;
}

/**
 * The smallest fret on `stringIndex` sounding pitch class `pc` strictly above
 * `aboveMidi`. That "strictly above" is what stacks the triad: each note is the
 * next chord tone up rather than any note of that name.
 *
 * Next on *this string*, though, which is not always the next one in pitch — a
 * string whose open note already sits above the note wanted can only reach it an
 * octave higher. So this alone does not guarantee a closed voicing; the caller
 * checks the span.
 */
function nextToneAbove(stringIndex: number, pc: number, aboveMidi: number): number {
  const open = STRING_MIDI[stringIndex];
  const fret = (((pc - open) % 12) + 12) % 12;
  // The pitch class recurs every 12 frets; step up until it clears the note below.
  let midi = open + fret;
  let f = fret;
  while (midi <= aboveMidi) {
    f += 12;
    midi += 12;
  }
  return f;
}

/** Highest fret one of these shapes may ask a finger to reach. */
const MAX_FRET = 16;

/**
 * Every triad shape for a chord: each inversion, on each string set, at the
 * lowest place on the neck it can actually be held.
 *
 * The search walks up the neck and keeps the first position that works, because
 * the lowest one is not always playable. A pitch class comes round every twelve
 * frets, but the shape built on it does not: C minor's second inversion on the
 * top three strings wants frets 0-1-11 down at the nut, which is not a hand
 * shape, and only becomes one — 12-13-11 — an octave up. Taking the first
 * playable position finds that, where stopping at fret 11 would have found
 * nothing and dropped the shape.
 *
 * One shape per string set per inversion is the whole set: above these, the same
 * ones come round again twelve frets higher, which is the point of learning them
 * rather than a separate thing to learn.
 */
export function triadVoicings(rootNote: string, intervals: readonly number[]): TriadVoicing[] {
  const root = semitoneOf(rootNote);
  const tones = intervals.map((interval) => (root + interval) % 12);
  const voicings: TriadVoicing[] = [];

  for (const set of TRIAD_STRING_SETS) {
    TRIAD_INVERSIONS.forEach((inv, invIndex) => {
      // The bottom of the stack is whichever chord tone this inversion puts
      // there; the other two follow it round in order.
      const order = [0, 1, 2].map((i) => tones[(invIndex + i) % 3]);
      const [s0, s1, s2] = set.strings;

      for (let f0 = 0; f0 <= MAX_FRET; f0++) {
        if ((STRING_MIDI[s0] + f0) % 12 !== order[0]) continue;

        const m0 = STRING_MIDI[s0] + f0;
        const f1 = nextToneAbove(s1, order[1], m0);
        const m1 = STRING_MIDI[s1] + f1;
        const f2 = nextToneAbove(s2, order[2], m1);
        const m2 = STRING_MIDI[s2] + f2;
        if (f1 > MAX_FRET || f2 > MAX_FRET) continue;

        // The three notes have to fit inside one octave, or it is not this
        // triad any more. They can fail to: a string whose open note already
        // sits above the note wanted has to reach a whole octave higher for it,
        // which spreads the voicing instead of stacking it. G major on the top
        // three strings does exactly that at the nut. Climbing the neck fixes
        // it, because higher up every string can reach the note it needs.
        if (m2 - m0 >= 12) continue;

        const frets = [-1, -1, -1, -1, -1, -1];
        frets[s0] = f0;
        frets[s1] = f1;
        frets[s2] = f2;

        const fretted = frets.filter((fret) => fret > 0);
        // More than a four-fret reach is not one hand position any more. The
        // same shape twelve frets up usually is, so keep climbing rather than
        // giving up on it.
        if (fretted.length && Math.max(...fretted) - Math.min(...fretted) > 4) continue;

        voicings.push({
          shape: { frets, fingers: fingersFor(frets) },
          inversion: inv.key,
          stringSet: set.key,
          startFret: fretted.length ? Math.min(...fretted) : 0,
          id: `${set.key}-${inv.key}-${f0}`,
        });
        break;
      }
    });
  }

  return voicings;
}
