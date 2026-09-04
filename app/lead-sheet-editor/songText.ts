// ─── Song text shapes ───────────────────────────────────────────────────
//
// Telling a section header from a chord is the one question every reader of
// a sheet has to answer first. The rule itself lives in app/lib/chordGrammar
// so that transposition, bulk replace and the progression view all decide it
// the same way; this module is only about the shape of a line.

export { isChordName } from "../lib/chordGrammar";
import { isChordName } from "../lib/chordGrammar";

/** The label of a section-header line, or null when the line is anything else. */
export function asSectionHeader(line: string): string | null {
  const m = line.match(/^\[([^\[\]]+)\]$/);
  if (!m) return null;
  const inner = m[1].trim();
  return isChordName(inner) ? null : inner;
}
