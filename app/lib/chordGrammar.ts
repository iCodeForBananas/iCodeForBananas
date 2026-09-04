// ─── What counts as a chord ─────────────────────────────────────────────────
//
// One grammar, used everywhere, because every consumer has to agree. A bracket
// token that reads as a chord gets transposed, listed in bulk replace, and
// drawn in the progression view; one that does not becomes a section header.
// Two copies of this rule drifting apart would make a song render differently
// depending on which code path looked at it.

/**
 * Quality words, longest first so `min` is never consumed as `m` plus leftovers.
 * `M` is the uppercase major-seventh spelling (CM7), distinct from `m`.
 */
const QUALITY = "maj|min|dim|aug|sus|add|alt|m|M|\\+|°|ø|Δ";

/**
 * Root, then any run of quality words and (optionally altered) scale degrees,
 * then an optional slash tail.
 *
 * Degrees are matched one digit at a time rather than as `\d+`. It reads a
 * little oddly, but it makes each step of the run consume exactly one thing, so
 * the pattern cannot backtrack combinatorially on a long run of digits.
 *
 * The slash tail takes a bass note (`D/F#`) or a bare degree, because `C6/9` is
 * a real chord and the 9 there is not a bass note.
 */
const CHORD_RE = new RegExp(
  `^[A-G][b#]?(?:(?:${QUALITY})|[b#]?\\d)*(?:/(?:[A-G][b#]?|\\d))?$`
);

/**
 * Does the text inside a bracket read as a chord rather than a name?
 *
 * Deliberately strict about what follows the root: section names starting with
 * a note letter are the whole difficulty here, and `Bridge`, `Chorus`, `Bass`
 * and `Ending` all have to come out false. See app/lead-sheet-editor for the
 * test that pins both directions.
 */
export function isChordName(inner: string): boolean {
  return CHORD_RE.test(inner);
}
