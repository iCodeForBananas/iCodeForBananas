// ─── Song text shapes ───────────────────────────────────────────────────
//
// Telling a section header from a chord is the one question every reader of
// a sheet has to answer first, so it lives on its own with no dependencies.

// A standalone [text] line is a section header unless the text looks like a chord.
const CHORD_RE = /^[A-G][b#]?(m|maj|min|dim|aug|sus|add|dom)?(\d+)?(\/[A-G][b#]?)?$/;

/** Does the text inside a bracket read as a chord rather than a name? */
export function isChordName(inner: string): boolean {
  return CHORD_RE.test(inner);
}

/** The label of a section-header line, or null when the line is anything else. */
export function asSectionHeader(line: string): string | null {
  const m = line.match(/^\[([^\[\]]+)\]$/);
  if (!m) return null;
  const inner = m[1].trim();
  return isChordName(inner) ? null : inner;
}
