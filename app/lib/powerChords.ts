import { semitoneFromE, type ChordShape } from "./chordShapes";
import { STANDARD_TUNING, type GuitarTuning } from "./tunings";

// Power chords: root, fifth and the root an octave up, nothing else. With no
// third they are neither major nor minor, so every chord type on a root reduces
// to the same one (G, Gm, G7 and Gmaj7 all play as G5). Worked out from the
// tuning's open-string pitches rather than a table, so Drop D's one-finger
// grip and the open tunings fall out of the same arithmetic.

/** The strings a power chord's root sits on: 6th (lowest) and 5th. */
export const POWER_CHORD_ROOT_STRINGS = [0, 1] as const;

/** Past this, the root an octave up is dropped rather than stretched for. */
const MAX_REACH = 3;

export interface PowerChordShape {
  /** Stable per root string, so a chord pinned to it survives a type change. */
  id: string;
  /** Index into the tuning, lowest string first (0 is the 6th string). */
  rootString: number;
  rootFret: number;
  shape: ChordShape;
}

/** The label a power chord takes: the root and a 5. */
export const powerChordLabel = (note: string): string => `${note}5`;

/** Pitch class (C = 0) of a note name, sharps or flats. */
const pitchClass = (note: string): number => (semitoneFromE(note) + 4) % 12;

/** Index finger on the root, the others one per fret above it. */
const fingersFor = (frets: number[], rootFret: number): number[] => {
  const used = new Set<number>();
  return frets.map((fret) => {
    if (fret <= 0) return 0;
    let finger = Math.min(Math.max(fret - rootFret, 0) + 1, 4);
    // Two notes on one fret above the root take neighbouring fingers.
    while (finger > 1 && finger < 4 && used.has(finger)) finger++;
    used.add(finger);
    return finger;
  });
};

/**
 * One power chord with its root on the given string, at the lowest fret that
 * root sits on there (open if the string is the root). The fifth goes on the
 * next string up and the octave on the one after, each wherever this tuning
 * puts them; null when the tuning leaves no playable grip.
 */
export const powerChordOnString = (
  note: string,
  rootString: number,
  tuning: GuitarTuning = STANDARD_TUNING
): PowerChordShape | null => {
  const midi = tuning.midi;
  if (rootString + 1 >= midi.length) return null;
  const open = midi[rootString];
  let rootFret = (pitchClass(note) - (open % 12) + 12) % 12;
  const fretFor = (string: number, interval: number) => open + rootFret + interval - midi[string];

  // A string tuned above the fifth can't reach it at this fret; an octave up can.
  if (fretFor(rootString + 1, 7) < 0) rootFret += 12;
  const fifth = fretFor(rootString + 1, 7);
  if (fifth < 0) return null;

  const frets = Array(midi.length).fill(-1);
  frets[rootString] = rootFret;
  frets[rootString + 1] = fifth;

  if (rootString + 2 < midi.length) {
    const octave = fretFor(rootString + 2, 12);
    const fretted = [rootFret, fifth, octave].filter((f) => f > 0);
    const reach = fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
    if (octave >= 0 && reach <= MAX_REACH) frets[rootString + 2] = octave;
  }

  const playedFrets = frets.filter((f) => f > 0);
  if (playedFrets.length && Math.max(...playedFrets) - Math.min(...playedFrets) > MAX_REACH) return null;

  return {
    id: `power-${rootString}`,
    rootString,
    rootFret,
    shape: { frets, fingers: fingersFor(frets, rootFret) },
  };
};

/** The 6th-string-root and 5th-string-root power chords for a root note. */
export const powerChordShapes = (note: string, tuning: GuitarTuning = STANDARD_TUNING): PowerChordShape[] =>
  POWER_CHORD_ROOT_STRINGS.map((s) => powerChordOnString(note, s, tuning)).filter(
    (p): p is PowerChordShape => p !== null
  );
