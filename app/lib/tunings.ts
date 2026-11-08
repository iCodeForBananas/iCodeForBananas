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
  /** The major chord the open strings ring, when they ring one. */
  openChordRoot?: string;
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

export const OPEN_G_TUNING: GuitarTuning = {
  id: "open-g",
  name: "Open G",
  notes: ["D", "G", "D", "G", "B", "D"],
  midi: [38, 43, 50, 55, 59, 62],
  description: "D G D G B D — the open strings ring a G major chord, and one finger across a fret plays any major chord",
  openChordRoot: "G",
};

export const OPEN_E_TUNING: GuitarTuning = {
  id: "open-e",
  name: "Open E",
  notes: ["E", "B", "E", "G#", "B", "E"],
  midi: [40, 47, 52, 56, 59, 64],
  description: "E B E G# B E — the open strings ring an E major chord, and one finger across a fret plays any major chord",
  openChordRoot: "E",
};

export const TUNINGS: GuitarTuning[] = [STANDARD_TUNING, DROP_D_TUNING, OPEN_G_TUNING, OPEN_E_TUNING];

/** The tuning with this id; anything unrecognised reads as standard. */
export const tuningById = (id?: string | null): GuitarTuning =>
  TUNINGS.find((t) => t.id === id) ?? STANDARD_TUNING;

/** Widest gap between fretted notes that is still an easy grab. */
const COMFORTABLE_REACH = 2;

/** The widest a note added to complete a chord may stretch the hand. */
const MAX_REPAIR_REACH = 3;

/** Past this many frets between fingers, a shape is not one hand position. */
const MAX_PLAYABLE_REACH = 4;

const fretReach = (frets: number[]): number => {
  const fretted = frets.filter((fret) => fret > 0);
  return fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
};

const pitchClasses = (frets: number[], midi: number[]): Set<number> =>
  new Set(frets.flatMap((fret, i) => (fret < 0 ? [] : [(midi[i] + fret) % 12])));

const withString = (frets: number[], string: number, fret: number): number[] =>
  frets.map((current, s) => (s === string ? fret : current));

/**
 * Puts a lost chord tone back, using a string that is muted or doubling another
 * note. Muted strings go first, since using one takes nothing away.
 */
function restoreTone(frets: number[], midi: number[], tone: number): number[] {
  const hasDouble = (string: number) =>
    pitchClasses(withString(frets, string, -1), midi).size === pitchClasses(frets, midi).size;

  let best = frets;
  let bestCost = Infinity;
  for (const [string, current] of frets.entries()) {
    if (current >= 0 && !hasDouble(string)) continue;
    const openFret = (((tone - midi[string]) % 12) + 12) % 12;
    for (const fret of [openFret, openFret + 12]) {
      const trial = withString(frets, string, fret);
      const reach = fretReach(trial);
      if (reach > Math.max(MAX_REPAIR_REACH, fretReach(frets))) continue;
      const cost = reach + (current >= 0 ? 10 : 0);
      if (cost < bestCost) {
        best = trial;
        bestCost = cost;
      }
    }
  }
  return best;
}

/**
 * A standard-tuning shape, re-fretted to sound the same chord in `tuning`.
 *
 * A string tuned down has to be fretted that much higher to reach its old note.
 * That usually costs nothing — an F barre's low string just joins the two beside
 * it — but it wrecks the open G family, whose bass note ends up at fret 5 with
 * the rest of the hand at the nut. Those drop the string instead, as a player
 * would, unless it is the only place a chord tone was: a Gmaj9 with no G left in
 * it is not a Gmaj9, so that one keeps the stretch.
 *
 * A string tuned up can have no way to reach its old note at all, and then a
 * chord tone can go missing. Those are put back on another string inside the
 * hand, so the shape may be voiced differently but still spells the chord.
 *
 * Returns null when no playable version of the shape spells the chord, so that
 * nothing is ever drawn under a name it does not play.
 *
 * `fingers` is carried over untouched; nothing draws it.
 */
export function retuneShape(shape: ChordShape, tuning: GuitarTuning): ChordShape | null {
  if (tuning === STANDARD_TUNING) return shape;

  const tones = pitchClasses(shape.frets, STANDARD_TUNING.midi);
  const sounding = shape.frets.map((fret, i) => (fret < 0 ? null : STANDARD_TUNING.midi[i] + fret));
  let frets = shape.frets.map((fret, i) => {
    if (fret < 0) return -1;
    const moved = fret + STANDARD_TUNING.midi[i] - tuning.midi[i];
    if (moved < 0) sounding[i] = null;
    return moved < 0 ? -1 : moved;
  });

  const standardReach = fretReach(shape.frets);
  frets.forEach((fret, i) => {
    if (fret === shape.frets[i] || fret < 0) return;
    const muted = withString(frets, i, -1);
    const tooFar =
      fretReach(frets) > Math.max(COMFORTABLE_REACH, standardReach) && fretReach(muted) < fretReach(frets);
    const others = new Set(sounding.flatMap((pitch, s) => (pitch === null || s === i ? [] : [pitch % 12])));
    if (tooFar && others.size === new Set(sounding.flatMap((p) => (p === null ? [] : [p % 12]))).size) {
      frets = muted;
      sounding[i] = null;
    }
  });

  for (const tone of tones) {
    if (!pitchClasses(frets, tuning.midi).has(tone)) frets = restoreTone(frets, tuning.midi, tone);
  }

  const complete = [...tones].every((tone) => pitchClasses(frets, tuning.midi).has(tone));
  if (!complete || fretReach(frets) > MAX_PLAYABLE_REACH) return null;

  return { frets, fingers: [...shape.fingers] };
}
