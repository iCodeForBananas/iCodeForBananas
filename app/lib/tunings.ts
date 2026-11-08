import type { ChordShape } from "./chordShapes";

// The tunings every chord on a page can be redrawn for. The chord tables are all
// written for standard tuning, so another tuning is a transformation of those
// shapes rather than a second set of tables.

export interface GuitarTuning {
  id: string;
  name: string;
  /** Open-string note names, lowest string first. */
  notes: string[];
  /** Open-string pitches as MIDI note numbers, lowest string first. */
  midi: number[];
  description: string;
}

export const STANDARD_TUNING: GuitarTuning = {
  id: "standard",
  name: "Standard",
  notes: ["E", "A", "D", "G", "B", "E"],
  midi: [40, 45, 50, 55, 59, 64],
  description: "Standard tuning, E A D G B E from the lowest string",
};

export const DROP_D_TUNING: GuitarTuning = {
  id: "drop-d",
  name: "Drop D",
  notes: ["D", "A", "D", "G", "B", "E"],
  midi: [38, 45, 50, 55, 59, 64],
  description: "The lowest string tuned down a whole step to D, so D A D G B E — every chord is redrawn to match",
};

export const TUNINGS: GuitarTuning[] = [STANDARD_TUNING, DROP_D_TUNING];

/** The tuning with this id; anything unrecognised reads as standard. */
export const tuningById = (id?: string | null): GuitarTuning =>
  TUNINGS.find((t) => t.id === id) ?? STANDARD_TUNING;

/** Widest gap between fretted notes that is still an easy grab. */
const COMFORTABLE_REACH = 2;

const fretReach = (frets: number[]): number => {
  const fretted = frets.filter((fret) => fret > 0);
  return fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
};

const pitchClassCount = (frets: number[]): number =>
  new Set(
    frets.flatMap((fret, i) => (fret < 0 ? [] : [(STANDARD_TUNING.midi[i] + fret) % 12]))
  ).size;

/**
 * A standard-tuning shape, re-fretted to sound the same notes in `tuning`.
 *
 * A string tuned down has to be fretted that much higher to reach its old note.
 * That usually costs nothing — an F barre's low string just joins the two beside
 * it — but it wrecks the open G family, whose bass note ends up at fret 5 with
 * the rest of the hand at the nut. Those drop the string instead, as a player
 * would, unless it is the only place a chord tone was: a Gmaj9 with no G left in
 * it is not a Gmaj9, so that one keeps the stretch.
 *
 * `fingers` is carried over untouched; nothing draws it.
 */
export function retuneShape(shape: ChordShape, tuning: GuitarTuning): ChordShape {
  const frets = [...shape.frets];

  tuning.midi.forEach((open, i) => {
    const offset = STANDARD_TUNING.midi[i] - open;
    if (offset === 0 || frets[i] < 0) return;

    const moved = frets.map((fret, s) => (s === i ? fret + offset : fret));
    const muted = frets.map((fret, s) => (s === i ? -1 : fret));
    const tooFar = fretReach(moved) > Math.max(COMFORTABLE_REACH, fretReach(frets));
    const canLoseString = pitchClassCount(muted) === pitchClassCount(frets);

    frets[i] = tooFar && canLoseString ? -1 : moved[i];
  });

  return { frets, fingers: [...shape.fingers] };
}
