// ─── Keys, chords, transposition and capo ───────────────────────────────────
//
// Two ideas here are worth stating before the code, because getting them
// confused is the usual way a chord chart goes wrong.
//
// 1. A song has one canonical key. Nothing in this module rewrites it. Both
//    transforms below produce a *reading* of the song; the stored song is
//    untouched, so there is always something to go back to.
//
// 2. Transposing and putting on a capo are different things that happen to
//    move chords by a similar-looking amount.
//
//      Transposing changes the music. A song in G transposed up two sounds in
//      A, and the chart now says A.
//
//      A capo changes only your hands. A song in Eb with a capo on 1 still
//      sounds in Eb and the chart still says Eb; you just finger D shapes.
//
//    So they compose but they are not the same number, and the key the chart
//    reports is a function of the transposition alone.

import { isChordName } from "./chordGrammar";

/** A key: a pitch class 0-11 plus whether it is minor. */
export interface Key {
  pitchClass: number;
  minor: boolean;
}

export interface Chord {
  /** 0-11, C is 0. */
  rootPitchClass: number;
  /** Everything after the root: "m7", "sus4", "maj7#11". Carried, never parsed. */
  quality: string;
  /** A slash bass note, when it is a note. Null for "C6/9", whose 9 is a degree. */
  bassPitchClass: number | null;
  /** The slash tail when it is not a note, so "C6/9" survives a round trip. */
  slashDegree: string | null;
}

// ─── Note names ──────────────────────────────────────────────────────────────

const NOTE_TO_PITCH_CLASS: Record<string, number> = {
  C: 0, "B#": 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, Fb: 4,
  "E#": 5, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10,
  Bb: 10, B: 11, Cb: 11,
};

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

/**
 * The key each pitch class is normally written as, and whether that key is
 * spelled with flats. Both are needed and neither can be derived from the
 * other: F major has no flat in its name but is a one-flat key, so a chart in
 * F wants Bb rather than A#.
 *
 * Where two spellings are both real (F# and Gb, both six accidentals) this
 * picks one, so that transposing always lands somewhere playable rather than
 * in a theoretical key like D# major with nine sharps.
 */
const MAJOR_KEYS: { name: string; flats: boolean }[] = [
  { name: "C", flats: false },
  { name: "Db", flats: true },
  { name: "D", flats: false },
  { name: "Eb", flats: true },
  { name: "E", flats: false },
  { name: "F", flats: true },
  { name: "F#", flats: false },
  { name: "G", flats: false },
  { name: "Ab", flats: true },
  { name: "A", flats: false },
  { name: "Bb", flats: true },
  { name: "B", flats: false },
];

const MINOR_KEYS: { name: string; flats: boolean }[] = [
  { name: "Cm", flats: true },
  { name: "C#m", flats: false },
  { name: "Dm", flats: true },
  { name: "Ebm", flats: true },
  { name: "Em", flats: false },
  { name: "Fm", flats: true },
  { name: "F#m", flats: false },
  { name: "Gm", flats: true },
  { name: "G#m", flats: false },
  { name: "Am", flats: false },
  { name: "Bbm", flats: true },
  { name: "Bm", flats: false },
];

const wrap = (n: number) => ((n % 12) + 12) % 12;

// ─── Keys ────────────────────────────────────────────────────────────────────

const KEY_RE = /^([A-G][b#]?)\s*(m|min|minor)?$/;

/** Read a written key. Accepts the theoretical spellings (Cb, E#) as input. */
export function parseKey(text: string): Key | null {
  const match = text.trim().match(KEY_RE);
  if (!match) return null;
  const pitchClass = NOTE_TO_PITCH_CLASS[match[1]];
  if (pitchClass === undefined) return null;
  return { pitchClass, minor: match[2] !== undefined };
}

/** The name a key is normally written under. Cb major comes back as B. */
export function formatKey(key: Key): string {
  return (key.minor ? MINOR_KEYS : MAJOR_KEYS)[wrap(key.pitchClass)].name;
}

/** Does this key write its accidentals as flats? */
export function keyPrefersFlats(key: Key): boolean {
  return (key.minor ? MINOR_KEYS : MAJOR_KEYS)[wrap(key.pitchClass)].flats;
}

export function transposeKey(key: Key, semitones: number): Key {
  return { pitchClass: wrap(key.pitchClass + semitones), minor: key.minor };
}

/**
 * How a note is spelled in a given key. This is the whole reason a key has to
 * be threaded through transposition: the same pitch is A# in B major and Bb in
 * F major, and picking by the direction of travel gets it wrong half the time.
 */
export function formatNote(pitchClass: number, key: Key | null): string {
  const names = key && keyPrefersFlats(key) ? FLAT_NAMES : SHARP_NAMES;
  return names[wrap(pitchClass)];
}

// ─── Chords ──────────────────────────────────────────────────────────────────

const CHORD_RE = /^([A-G][b#]?)([^/]*)(?:\/(.*))?$/;
const NOTE_ONLY_RE = /^[A-G][b#]?$/;

/**
 * Read a chord token. Returns null for anything that is not one.
 *
 * The grammar check comes first and is not optional. CHORD_RE below only
 * splits: its quality part is `[^/]*`, which happily swallows the tail of any
 * word beginning with a note letter, so without this gate "Chorus" parses as C
 * plus "horus" and transposes into "Dhorus".
 */
export function parseChord(token: string): Chord | null {
  const trimmed = token.trim();
  if (!isChordName(trimmed)) return null;
  const match = trimmed.match(CHORD_RE);
  if (!match) return null;
  const [, root, quality, tail] = match;
  const rootPitchClass = NOTE_TO_PITCH_CLASS[root];
  if (rootPitchClass === undefined) return null;

  // A slash tail is a bass note ("D/F#") or a scale degree ("C6/9"). Only the
  // first moves with the chord; the second is part of the chord's name.
  let bassPitchClass: number | null = null;
  let slashDegree: string | null = null;
  if (tail !== undefined) {
    if (NOTE_ONLY_RE.test(tail)) bassPitchClass = NOTE_TO_PITCH_CLASS[tail];
    else slashDegree = tail;
  }
  return { rootPitchClass, quality, bassPitchClass, slashDegree };
}

export function formatChord(chord: Chord, key: Key | null): string {
  let out = formatNote(chord.rootPitchClass, key) + chord.quality;
  if (chord.bassPitchClass !== null) out += `/${formatNote(chord.bassPitchClass, key)}`;
  else if (chord.slashDegree !== null) out += `/${chord.slashDegree}`;
  return out;
}

export function transposeChord(chord: Chord, semitones: number): Chord {
  return {
    ...chord,
    rootPitchClass: wrap(chord.rootPitchClass + semitones),
    bassPitchClass: chord.bassPitchClass === null ? null : wrap(chord.bassPitchClass + semitones),
  };
}

// ─── The two transforms ──────────────────────────────────────────────────────

/**
 * How a song is being read right now. Neither field is stored on the song, and
 * neither one changes it.
 */
export interface View {
  /** Semitones the music is moved by. Changes what key the song is in. */
  transpose: number;
  /** Fret the capo is on. Changes the shapes, not the key. */
  capo: number;
}

export const NO_CAPO_NO_TRANSPOSE: View = { transpose: 0, capo: 0 };

/**
 * The key the music sounds in. A function of the transposition only: a capo
 * cannot change what key a song is in, and this is the line that says so.
 */
export function soundingKey(written: Key, view: View): Key {
  return transposeKey(written, view.transpose);
}

/**
 * The key whose shapes you actually finger. A capo raises the strings, so the
 * shapes move down by the same amount to keep the sounding pitch.
 */
export function shapeKey(written: Key, view: View): Key {
  return transposeKey(soundingKey(written, view), -view.capo);
}

/**
 * The interval every chord shape moves by. Transposing moves the music up;
 * a capo moves the shapes down to compensate for strings that are already
 * higher. They compose here, and only here.
 */
export function shapeOffset(view: View): number {
  return view.transpose - view.capo;
}

/**
 * One written chord token, as it should be fingered and printed under a view.
 *
 * The spelling comes from the shape key, not the written key and not the
 * sounding key. That is the part people get wrong: a chart in Eb with a capo
 * on 1 is fingered in D, so its chords want sharps, even though the song is
 * still in a flat key and still says so at the top.
 *
 * A token that is not a chord is returned untouched, so lyrics, markers and
 * section names pass through whatever this is applied to.
 */
export function readChordInView(token: string, written: Key | null, view: View): string {
  const chord = parseChord(token);
  if (!chord) return token;
  return formatChord(
    transposeChord(chord, shapeOffset(view)),
    written ? shapeKey(written, view) : null
  );
}
