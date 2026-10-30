// ─── The old shape, and the way out of it ───────────────────────────────────
//
// Songs are stored as a jsonb array of sections with free-text content. The
// canonical form is ChordPro. These functions convert between the two and,
// more importantly, check that a conversion did not lose anything.
//
// Both directions are pure so the backfill can be trusted before it is run:
// the interesting question is not "does it convert" but "does converting and
// converting back give the same song", and that is answerable without a
// database.

import {
  formatChordPro,
  formatLine,
  parseLine,
  type Line,
  type Section as ChordProSection,
  type SectionKind,
  type Song,
} from "@/app/lib/chordPro";
import { asSectionHeader } from "./songText";

/** The parts of a stored row this conversion reads. */
export interface LegacySheet {
  title?: string | null;
  key?: string | null;
  tempo?: number | null;
  general_notes?: string | null;
  sections?: LegacySection[] | null;
}

export interface LegacySection {
  type: string;
  label?: string;
  content?: string;
  notes?: string;
}

const KINDS: SectionKind[] = [
  "intro",
  "verse",
  "pre-chorus",
  "chorus",
  "bridge",
  "outro",
  "other",
];

const kindOf = (type: string): SectionKind =>
  KINDS.find((k) => k === type) ?? "other";

/**
 * Playback settings are written into the song's notes as `Drums: …` and
 * `Sub bass: …` lines, but the column is the source of truth and the lines are
 * regenerated from it. Carrying them into the body would give a song two
 * copies of its kit, which would then drift.
 */
const SETTINGS_LINE = /^\s*(drums|sub bass|strings)\s*:/i;

const isSettingsLine = (line: string) => SETTINGS_LINE.test(line);

/** Notes become comments, one per line, blank lines dropped. */
const commentLines = (notes: string | undefined | null): Line[] =>
  (notes ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !isSettingsLine(line))
    .map((text) => ({ kind: "comment", text }) as const);

/**
 * A section's content, with any bracketed header line promoted out of the text
 * and into a section of its own. The legacy format writes headers as `[Chorus]`
 * lines, and ChordPro reads every bracket as a chord, so a header left in place
 * would silently become one.
 */
function splitContent(section: LegacySection): ChordProSection[] {
  const out: ChordProSection[] = [];
  let current: ChordProSection = {
    kind: kindOf(section.type),
    label: section.label || null,
    lines: [],
  };

  for (const raw of (section.content ?? "").split("\n")) {
    const header = asSectionHeader(raw.trim());
    if (header !== null) {
      if (current.lines.length) out.push(current);
      current = { kind: kindOf(header.toLowerCase()), label: header, lines: [] };
      continue;
    }
    if (raw.trim() === "") current.lines.push({ kind: "blank" });
    else if (isSettingsLine(raw)) continue;
    else current.lines.push({ kind: "lyric", segments: parseLine(raw) });
  }

  // The section's own notes belong to whatever it ended up as.
  current.lines.push(...commentLines(section.notes));
  if (current.lines.length) out.push(current);
  return out;
}

export function legacyToSong(sheet: LegacySheet): Song {
  const song: Song = { meta: {}, sections: [] };
  if (sheet.title) song.meta.title = sheet.title;
  if (sheet.key) song.meta.key = sheet.key;
  if (sheet.tempo != null) song.meta.tempo = sheet.tempo;

  const preamble = commentLines(sheet.general_notes);
  if (preamble.length) song.sections.push({ kind: "other", label: null, lines: preamble });

  for (const section of sheet.sections ?? []) {
    song.sections.push(...splitContent(section));
  }
  return song;
}

export const legacyToChordPro = (sheet: LegacySheet): string =>
  formatChordPro(legacyToSong(sheet));

// ─── Verifying ───────────────────────────────────────────────────────────────

/**
 * Every word and chord of a song, in order, with the structure flattened away.
 *
 * This is the definition of "the same song" the backfill uses. It deliberately
 * ignores how a song is divided up, because the conversion is allowed to
 * promote an inline header into a section of its own, and it deliberately does
 * not ignore a single character of chord or lyric, because nothing else is
 * allowed to change.
 */
export function songContent(song: Song): string[] {
  const out: string[] = [];
  for (const section of song.sections) {
    for (const line of section.lines) {
      if (line.kind === "lyric") {
        const text = formatLine(line.segments).trimEnd();
        if (text !== "") out.push(text);
      } else if (line.kind === "comment") out.push(`> ${line.text}`);
      else if (line.kind === "unknown") out.push(line.raw);
    }
  }
  return out;
}

export function legacyContent(sheet: LegacySheet): string[] {
  const out: string[] = [];
  for (const line of (sheet.general_notes ?? "").split("\n")) {
    const text = line.trim();
    if (text !== "" && !isSettingsLine(text)) out.push(`> ${text}`);
  }
  for (const section of sheet.sections ?? []) {
    for (const raw of (section.content ?? "").split("\n")) {
      const text = raw.trimEnd();
      if (text.trim() === "" || isSettingsLine(text)) continue;
      // A header line is structure in both forms, so it is not content here.
      if (asSectionHeader(text.trim()) !== null) continue;
      out.push(text);
    }
    for (const line of (section.notes ?? "").split("\n")) {
      const text = line.trim();
      if (text !== "" && !isSettingsLine(text)) out.push(`> ${text}`);
    }
  }
  return out;
}

export interface Verdict {
  ok: boolean;
  /** What differs, when something does. Empty when the conversion is sound. */
  differences: string[];
}

/**
 * Convert a row and check the result says the same thing. A row that does not
 * verify is left alone by the backfill and reported, which is the whole point:
 * the output worth reading is the list of songs it refused.
 */
export function verifyConversion(sheet: LegacySheet): Verdict {
  const before = legacyContent(sheet);
  const after = songContent(legacyToSong(sheet));
  const differences: string[] = [];

  if (before.length !== after.length) {
    differences.push(`${before.length} lines before, ${after.length} after`);
  }
  for (let i = 0; i < Math.max(before.length, after.length); i++) {
    if (before[i] !== after[i]) {
      differences.push(`line ${i + 1}: ${JSON.stringify(before[i])} became ${JSON.stringify(after[i])}`);
      if (differences.length > 5) break;
    }
  }
  return { ok: differences.length === 0, differences };
}
