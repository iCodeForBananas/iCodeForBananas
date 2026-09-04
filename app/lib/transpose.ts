import { isChordName } from "./chordGrammar";

// ─── Chord transposition ──────────────────────────────────────────────────────
// Lead sheet chords are written as bracketed tokens, e.g. "[Am7]", "[F#maj7]",
// "[Am/E]" — see app/lead-sheet-editor/shared.tsx's ChordPro-style parser.

const NOTE_TO_SEMITONE: Record<string, number> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

function transposeNote(note: string, semitones: number, preferFlats: boolean): string | null {
  const idx = NOTE_TO_SEMITONE[note];
  if (idx === undefined) return null;
  const newIdx = (((idx + semitones) % 12) + 12) % 12;
  return preferFlats ? FLAT_NAMES[newIdx] : SHARP_NAMES[newIdx];
}

// Root + accidental, then the quality, then whatever follows a slash. Splitting
// only; whether the token is a chord at all is isChordName's question, and this
// pattern is far too permissive to answer it ("Chorus" splits quite happily).
const CHORD_TOKEN_RE = /^([A-G][b#]?)([^/]*)(?:\/(.*))?$/;

/** Only a bass note moves with the chord. A slash degree, as in C6/9, does not. */
const BASS_NOTE_RE = /^[A-G][b#]?$/;

/**
 * Transpose a single chord token (e.g. "Am7", "F#maj7", "Am/E") by the given
 * number of semitones. Preserves the quality/suffix and, for slash chords,
 * transposes the bass note independently. Returns the input unchanged if it
 * isn't a recognizable chord.
 */
export function transposeChord(chord: string, semitones: number): string {
  const trimmed = chord.trim();
  // Checked before splitting, not after. Without this, any word starting with a
  // note letter gets its first letter moved and the rest kept, so "Chorus"
  // transposes up a tone into "Dhorus".
  if (!isChordName(trimmed)) return chord;

  const match = trimmed.match(CHORD_TOKEN_RE);
  if (!match) return chord;
  const [, root, suffix, tail] = match;
  const preferFlats = semitones < 0;

  const newRoot = transposeNote(root, semitones, preferFlats);
  if (newRoot === null) return chord;

  let result = newRoot + suffix;
  if (tail !== undefined) {
    if (!BASS_NOTE_RE.test(tail)) return `${result}/${tail}`;
    const newBass = transposeNote(tail, semitones, preferFlats);
    if (newBass === null) return chord;
    result += `/${newBass}`;
  }
  return result;
}

/**
 * Transpose every "[Chord]" token in a line (or block of text) by the given
 * number of semitones. Non-chord bracket content is left untouched.
 */
export function transposeText(text: string, semitones: number): string {
  return text.replace(/\[([^[\]]*)\]/g, (full, inner) => {
    const trimmed = inner.trim();
    if (!isChordName(trimmed)) return full;
    return `[${transposeChord(trimmed, semitones)}]`;
  });
}

/**
 * Transpose a lead sheet's key (e.g. "G", "F#m", "Bb") by the given number of
 * semitones. Returns the input unchanged if it isn't a recognizable key.
 */
export function transposeKey(key: string, semitones: number): string {
  const trimmed = key.trim();
  const match = trimmed.match(/^([A-G][b#]?)(m?)$/);
  if (!match) return key;
  const [, root, minor] = match;
  const preferFlats = semitones < 0;
  const newRoot = transposeNote(root, semitones, preferFlats);
  if (newRoot === null) return key;
  return newRoot + minor;
}
