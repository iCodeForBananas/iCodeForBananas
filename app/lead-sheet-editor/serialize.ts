import type { LeadSheet } from "./shared";
import {
  formatDrumSettings,
  isDefaultDrumSettings,
  normalizeDrumSettings,
} from "./DrumMachine";
import {
  formatSubBassSettings,
  isDefaultSubBassSettings,
  normalizeSubBassSettings,
} from "./SubBass";

/**
 * The song as the plain text the editor types and revision history diffs.
 * `parseText` in the editor reads it back; the two have to stay a pair.
 */
export function serializeSheet(sheet: LeadSheet): string {
  const parts: string[] = [sheet.title || ""];

  const meta: string[] = [];
  if (sheet.key) meta.push(`Key: ${sheet.key}`);
  if (sheet.tempo) meta.push(`Tempo: ${sheet.tempo}`);
  if (meta.length) parts.push(meta.join("  "));

  // A kit left at defaults isn't worth a line — songs you never touched the
  // drums on stay clean. Changing anything writes the line on the next open.
  const drums = normalizeDrumSettings(sheet.metadata?.drums);
  if (!isDefaultDrumSettings(drums)) parts.push(formatDrumSettings(drums));

  // Same rule for the sub bass walk: a song nobody set one on stays clean.
  const subBass = normalizeSubBassSettings(sheet.metadata?.subBass);
  if (!isDefaultSubBassSettings(subBass)) parts.push(formatSubBassSettings(subBass));

  parts.push("");

  if (sheet.general_notes) {
    parts.push(sheet.general_notes);
    parts.push("");
  }

  for (const section of sheet.sections) {
    parts.push(`[${section.label || section.type}]`);
    if (section.content) parts.push(section.content);
    if (section.notes) {
      for (const line of section.notes.split("\n")) {
        parts.push(line.trim() ? `> ${line}` : "");
      }
    }
    parts.push("");
  }

  return parts.join("\n").trimEnd();
}
