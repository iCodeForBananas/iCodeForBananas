import { allNotes } from "./music";

// ─── CAGED ────────────────────────────────────────────────────────────────────
//
// Five chord shapes — C, A, G, E and D — are the five ways a major chord can be
// held on a guitar in standard tuning. Move each one up the neck until its root
// lands on the note you want and you have that chord in five places; the shapes
// come round in the order the system is named for, which is why C-A-G-E-D is
// both the mnemonic and the order you meet them walking up the neck.
//
// A scale position is then just the frets one of those shapes lives in. That is
// what makes the system worth using: a position is not an abstract box, it is
// the neighbourhood of a chord you already know, so the scale notes around your
// fingers are the ones that sound good over the chord under them.
//
// Everything here is derived from the five chord forms rather than from a table
// of scale boxes, so the position and the shape inside it cannot drift apart.

const mod12 = (n: number) => ((n % 12) + 12) % 12;

export const CAGED_ORDER = ["C", "A", "G", "E", "D"] as const;
export type CagedKey = (typeof CAGED_ORDER)[number];

/** Which triad the shapes are drawn as — the scale's own flavour. */
export type Tonality = "major" | "minor";

interface CagedForm {
  /** String the shape's own root sits on: 0 is the lowest string, 5 the highest. */
  anchorString: number;
  /**
   * Frets of the chord form, one per string, as offsets from that anchor root.
   * `null` is a string the shape does not use. Offsets rather than frets because
   * the whole point of these shapes is that they slide.
   */
  major: (number | null)[];
  minor: (number | null)[];
}

/**
 * The five forms, written as the open chords they are named after and then
 * measured from their own root. The C form, for instance, is x-3-2-0-1-0 with
 * its root on the fifth string at fret 3, so its offsets are 0, -1, -3, -2, -3.
 *
 * The minor forms are the same shapes with the third flattened. Two of them —
 * C and G — are stretches nobody would choose to hold, but they are still where
 * those positions are on the neck, and seeing the shape is the point.
 */
const CAGED_FORMS: Record<CagedKey, CagedForm> = {
  C: { anchorString: 1, major: [null, 0, -1, -3, -2, -3], minor: [null, 0, -2, -3, -2, 0] },
  A: { anchorString: 1, major: [null, 0, 2, 2, 2, 0], minor: [null, 0, 2, 2, 1, 0] },
  G: { anchorString: 0, major: [0, -1, -3, -3, -3, 0], minor: [0, -2, -3, -3, 0, 0] },
  E: { anchorString: 0, major: [0, 2, 2, 1, 0, 0], minor: [0, 2, 2, 0, 0, 0] },
  D: { anchorString: 2, major: [null, null, 0, 2, 3, 2], minor: [null, null, 0, 2, 3, 1] },
};

/** How each shape reads when you are looking for it on the neck. */
export const CAGED_BLURB: Record<CagedKey, string> = {
  C: "The open C chord, moved up — root on the 5th string, played with a stretch below it",
  A: "The open A chord, moved up — root on the 5th string, barre underneath it",
  G: "The open G chord, moved up — root on the 6th string, reaching back down the neck",
  E: "The open E chord, moved up — root on the 6th string, the everyday barre chord",
  D: "The open D chord, moved up — root on the 4th string, the top three strings",
};

export interface CagedPosition {
  key: CagedKey;
  /** Fret the shape's own root sits at, for this copy of it. */
  anchorFret: number;
  /** The frets this position covers, inclusive — the chord plus a fret either side. */
  low: number;
  high: number;
  /** The notes of the chord shape itself, which is what the position is built around. */
  chord: { s: number; fret: number }[];
}

/**
 * Every CAGED position that lands on the neck, in neck order.
 *
 * A shape has to fit on the neck whole to be worth offering: one reaching back
 * past the nut is dropped in favour of the copy an octave up — which is why an A
 * root has no open-position C shape but a perfectly good one at the 12th fret —
 * and one running off the last fret is dropped outright rather than shown as a
 * sliver of a position nobody can play.
 *
 * That also means the low frets of some keys belong to no shape at all. F# minor
 * starts at the E shape on the first fret, so its open strings are outside every
 * position, which is the truth of it rather than a gap to paper over.
 *
 * The anchor root is looked up in the tuning actually in use, so the positions
 * follow a retuned string rather than sitting where standard tuning would put
 * them. The shapes themselves only spell chords in standard tuning; see
 * `isStandardTuning`.
 */
export function cagedPositions(
  rootKey: string,
  tuning: string[],
  tonality: Tonality,
  numFrets: number,
): CagedPosition[] {
  const rootIndex = allNotes.indexOf(rootKey);
  if (rootIndex < 0) return [];

  const positions: CagedPosition[] = [];

  for (const key of CAGED_ORDER) {
    const form = CAGED_FORMS[key];
    const openIndex = allNotes.indexOf(tuning[form.anchorString] ?? "");
    if (openIndex < 0) continue;

    const offsets = tonality === "minor" ? form.minor : form.major;
    const used = offsets.filter((offset): offset is number => offset !== null);
    if (!used.length) continue;
    const lowOffset = Math.min(...used);
    const highOffset = Math.max(...used);

    const base = mod12(rootIndex - openIndex);
    for (let octave = 0; ; octave++) {
      const anchorFret = base + 12 * octave;
      // Off the end of the neck, and every copy above this one is further off.
      if (anchorFret + highOffset > numFrets) break;
      // Reaches back past the nut; the copy an octave up will not.
      if (anchorFret + lowOffset < 0) continue;

      positions.push({
        key,
        anchorFret,
        low: Math.max(0, anchorFret + lowOffset - 1),
        high: Math.min(numFrets, anchorFret + highOffset + 1),
        chord: offsets.flatMap((offset, s) =>
          offset === null ? [] : [{ s, fret: anchorFret + offset }]
        ),
      });
    }
  }

  return positions.sort((a, b) => a.low - b.low);
}

/** Standard tuning, which is the only one the five shapes actually spell chords in. */
export function isStandardTuning(tuning: string[]): boolean {
  return ["E", "A", "D", "G", "B", "E"].every((note, i) => tuning[i] === note);
}
