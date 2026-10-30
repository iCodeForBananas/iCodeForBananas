import { parseChordPro, type Song } from "@/app/lib/chordPro";
import { legacyToSong, type LegacySheet } from "./legacy";

/** A stored row, during the period where it may be in either shape. */
export type StoredSheet = LegacySheet & { chordpro?: string | null };

/**
 * The song a row holds, whichever shape it is in.
 *
 * Every read path goes through here rather than checking the column itself, so
 * the fallback is one decision in one place. When the backfill has finished and
 * nothing reaches the second line for a while, the legacy branch and the
 * `sections` column go together.
 */
export function sheetToSong(sheet: StoredSheet): Song {
  if (sheet.chordpro) return parseChordPro(sheet.chordpro);
  return legacyToSong(sheet);
}

/** Whether a row still needs converting. Counted, so the fallback can retire. */
export const isLegacyShape = (sheet: StoredSheet): boolean => !sheet.chordpro;
