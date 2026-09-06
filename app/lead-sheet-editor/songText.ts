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

/**
 * A `Sub bass: …` line, which the song text used to carry.
 *
 * The pad and the bass walk-down are gone, but a song written while they
 * existed still has the line in its text, and a line nobody strips shows up as
 * a performance note under the title. So it is still recognised here — only to
 * be thrown away, never parsed.
 */
const RETIRED_PREAMBLE_RE = /\b(?:Sub bass|Strings):\s*[^\n|]*/gi;

export function stripRetiredSettings(line: string): string {
  return line.replace(RETIRED_PREAMBLE_RE, "").trim();
}

export function hasRetiredSettings(line: string): boolean {
  RETIRED_PREAMBLE_RE.lastIndex = 0;
  return RETIRED_PREAMBLE_RE.test(line);
}
