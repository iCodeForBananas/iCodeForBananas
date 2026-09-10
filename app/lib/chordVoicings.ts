// Chord type groups, and every playable way to voice one of those types for a
// given root, up and down the neck. Extracted from chord-explorer so
// progression-builder (and anything else that wants "all the ways to play
// this chord") can share it instead of re-deriving it.

import {
  type ChordShape,
  sharpToFlat,
  flatToSharp,
  chordShapes,
  buildChordKey,
  eShapeTemplates,
  aShapeTemplates,
  transposeShape,
  semitoneFromE,
  semitoneFromA,
} from "./chordShapes";

// ── Chord type groups ─────────────────────────────────────────────────────────

// The full catalog — every type this page knows a shape for, grouped for
// browsing freely by anyone who wants to go from a major root to a minor
// voicing or back (chord-explorer's Chord Types panel: no root here is
// "a minor chord" or "a major chord," it's just a root note).
export const TYPE_GROUPS = [
  { label: "Triads", types: ["Major", "Minor"] },
  { label: "7th Chords", types: ["Maj7", "7", "m7", "mMaj7"] },
  { label: "Sus / Add", types: ["Sus2", "Sus4", "Add9"] },
  { label: "Extended", types: ["6", "9", "Maj9", "13", "Maj13", "m6", "m9", "m11"] },
] as const;

export type ChordType = (typeof TYPE_GROUPS)[number]["types"][number];

// The same catalog split by quality, for anything that wants to show only
// the chords that fit a root already committed to being major or minor
// (progression-builder's columns). Sus/Add chords have no third at all —
// major or minor — but the shapes here are built as major-chord variants,
// so they sit on the major side rather than in both lists.
export const MAJOR_TYPE_GROUPS = [
  { label: "Triads", types: ["Major"] },
  { label: "7th Chords", types: ["Maj7", "7"] },
  { label: "Sus / Add", types: ["Sus2", "Sus4", "Add9"] },
  { label: "Extended", types: ["6", "9", "Maj9", "13", "Maj13"] },
] as const;

export const MINOR_TYPE_GROUPS = [
  { label: "Triads", types: ["Minor"] },
  { label: "7th Chords", types: ["m7", "mMaj7"] },
  { label: "Extended", types: ["m6", "m9", "m11"] },
] as const;

export const CHORD_TYPE_TOOLTIPS: Record<string, string> = {
  Major: "Happy and bright — the most common chord type. A great starting point for any beginner",
  Minor: "Darker and more emotional — perfect for moody or dramatic songs",
  Maj7:  "A Major chord with an added major 7th — sounds rich and jazzy",
  "7":   "A dominant 7th — bluesy and slightly tense, like a chord that 'wants' to move somewhere",
  m7:    "A minor 7th — smooth and mellow, very common in jazz and R&B",
  mMaj7: "A minor chord with a major 7th — moody and unresolved, the classic 'spy movie' sound",
  Sus2:  "Suspended: replaces the middle note with the 2nd — creates an open, floating sound",
  Sus4:  "Suspended: replaces the middle note with the 4th — creates suspense that wants to resolve",
  Add9:  "A major chord with an added 9th — lush and colorful without being too complex",
  "6":   "A major chord with an added 6th — bright and sweet-sounding",
  "9":   "A dominant 9th — colorful and jazzy, very common in funk",
  Maj9:  "A major 7th with an added 9th — dreamy and lush",
  "13":  "A dominant chord stacked high — very jazzy and full of color",
  Maj13: "A major chord built all the way to the 13th — rich, complex jazz voicing",
  m6:    "A minor chord with an added 6th — wistful and a little unresolved, common in jazz and bossa nova",
  m9:    "A minor 7th with an added 9th — smooth and moody, a jazz and R&B staple",
  m11:   "A minor chord stacked with a 7th, 9th, and 11th — dense, atmospheric, very little sense of resolving anywhere",
};

export const GROUP_TOOLTIPS: Record<string, string> = {
  Triads:        "Three-note chords — the foundation of all harmony. Major and Minor are the two you'll use most",
  "7th Chords":  "Four-note chords with an added 7th — common in jazz, blues, and R&B",
  "Sus / Add":   "Chords that swap or add one note for an open, unresolved, or colorful sound",
  Extended:      "Chords built by stacking more notes beyond the 7th — used in jazz for rich, sophisticated harmony",
};

// ── Format helpers ────────────────────────────────────────────────────────────

const NO_SPACE_TYPES = ["6", "7", "m7", "9", "13", "m6", "m9", "m11", "mMaj7"];

export const formatChordLabel = (note: string, type: string) => {
  if (type === "Diminished") return `${note}°`;
  if (NO_SPACE_TYPES.includes(type)) return `${note}${type}`;
  return `${note} ${type}`;
};

// ── Voicings ─────────────────────────────────────────────────────────────────

export interface LabeledShape {
  shape: ChordShape;
  label: string;
  position?: string;
}

/** Highest fret a finger is asked to reach — past this the shape is off the neck. */
const MAX_FRET = 17;

/** Standard tuning, as MIDI note numbers: E2 A2 D3 G3 B3 E4. */
const STRING_MIDI = [40, 45, 50, 55, 59, 64];

/** The notes a shape actually sounds, in MIDI numbers, lowest string first. */
const shapePitches = (shape: ChordShape): number[] =>
  shape.frets
    .map((fret, i) => (fret < 0 ? null : STRING_MIDI[i] + fret))
    .filter((pitch): pitch is number => pitch !== null);

/**
 * How high a voicing sits. The average of the notes it sounds is what the ear
 * calls "higher up the neck": the bass note alone can't separate an open C from
 * a C barre that shares that bass but sits above it on every other string. The
 * bass breaks ties, so two voicings centred alike order by their bottom end.
 */
const voicingHeight = (shape: ChordShape): { center: number; bass: number } => {
  const pitches = shapePitches(shape);
  if (!pitches.length) return { center: 0, bass: 0 };
  return {
    center: pitches.reduce((sum, pitch) => sum + pitch, 0) / pitches.length,
    bass: Math.min(...pitches),
  };
};

/** Where on the neck the hand sits for a shape — 0 when nothing is fretted. */
const shapeStartFret = (shape: ChordShape): number => {
  const fretted = shape.frets.filter((fret) => fret > 0);
  return fretted.length ? Math.min(...fretted) : 0;
};

/** One rung of a chord's ladder up the neck. */
export interface NeckVoicing extends LabeledShape {
  /** Identity of this rung, so a chord pinned to it survives a re-render. */
  id: string;
  center: number;
  bass: number;
  /** Lowest fret the shape asks for — what "around fret N" is measured against. */
  startFret: number;
}

/**
 * Every playable way to sound this chord, ordered from the lowest-sounding to
 * the highest. Moveable barre shapes repeat every 12 frets, so each one is
 * offered at every octave that still fits on the neck — that repetition is what
 * lets a chord be found near whichever fret the progression is anchored at.
 */
export const getNeckVoicings = (note: string, type: string): NeckVoicing[] => {
  const voicings: NeckVoicing[] = [];
  const seen = new Set<string>();

  const add = (shape: ChordShape | null, id: string, label: string, position?: string) => {
    if (!shape) return;
    if (shape.frets.some((fret) => fret > MAX_FRET)) return;
    const key = shape.frets.join(",");
    if (seen.has(key)) return;
    seen.add(key);
    voicings.push({
      shape,
      id,
      label,
      position,
      startFret: shapeStartFret(shape),
      ...voicingHeight(shape),
    });
  };

  const canonical = flatToSharp[note] ?? note;
  const enharmonic = sharpToFlat[canonical] ?? flatToSharp[note];

  for (const n of [note, canonical, enharmonic].filter(Boolean) as string[]) {
    const shapes = chordShapes[buildChordKey(n, type)];
    if (shapes?.length) {
      shapes.forEach((s, i) => add(s, `open-${i}`, i === 0 ? "Open / Standard" : `Open Alt ${i + 1}`));
      break;
    }
  }

  const addBarre = (template: ChordShape | undefined, key: string, label: string, baseShift: number) => {
    if (!template) return;
    for (let shift = baseShift; shift <= MAX_FRET; shift += 12) {
      add(transposeShape(template, shift), `${key}-${shift}`, label, shift === 0 ? "Open" : `${shift}fr`);
    }
  };

  addBarre(eShapeTemplates[type], "e", "E-Shape Barre", semitoneFromE(note));
  addBarre(aShapeTemplates[type], "a", "A-Shape Barre", semitoneFromA(note));

  return voicings.sort((a, b) => a.center - b.center || a.bass - b.bass);
};

/** The Chord Types cards want each shape once, where it naturally falls. */
export const getVoicings = (note: string, type: string): LabeledShape[] => {
  const seen = new Set<string>();
  return getNeckVoicings(note, type).filter((v) => {
    if (seen.has(v.label)) return false;
    seen.add(v.label);
    return true;
  });
};
