// ─── The library ────────────────────────────────────────────────────────────

import type { View } from "@/app/lib/harmony";

export type Density = "comfortable" | "compact";

export interface LibraryEntry {
  id: string;
  title?: string | null;
  artist?: string | null;
  key?: string | null;
}

/**
 * Match a song by title or artist. Every term has to appear somewhere, in any
 * order, so "road empty" finds "Empty Road" and "beatles help" finds a Beatles
 * song called Help without either being typed exactly.
 */
export function matchesQuery(entry: LibraryEntry, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = `${entry.title ?? ""} ${entry.artist ?? ""}`.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

export const searchLibrary = <T extends LibraryEntry>(entries: T[], query: string): T[] =>
  entries.filter((entry) => matchesQuery(entry, query));

/**
 * Comfortable is for browsing, compact for a library you already know your way
 * around. It is a preference about the person rather than about any one song,
 * so unlike scroll speed it is stored once.
 */
const DENSITY_KEY = "leadsheet:density";

export function loadDensity(): Density {
  try {
    return window.localStorage.getItem(DENSITY_KEY) === "compact" ? "compact" : "comfortable";
  } catch {
    return "comfortable";
  }
}

export function saveDensity(density: Density): void {
  try {
    window.localStorage.setItem(DENSITY_KEY, density);
  } catch {
    // Private browsing. A forgotten preference is not worth an error.
  }
}

// ─── Setlists ────────────────────────────────────────────────────────────────

/**
 * A song's place in a setlist, which may ask for it in a different key or with
 * a capo for that set only.
 */
export interface SetlistEntry {
  transpose_override?: number | null;
  capo_override?: number | null;
  tempo_override?: number | null;
}

/**
 * How a set wants a song read.
 *
 * The overrides are a reading, exactly like the controls in the preview: they
 * produce a View and never touch the song. A set that plays something down a
 * tone is a fact about that set, and writing it back would change every other
 * set that uses the same song.
 */
export function setlistView(entry: SetlistEntry | null | undefined): View {
  return {
    transpose: entry?.transpose_override ?? 0,
    capo: entry?.capo_override ?? 0,
  };
}

/** The tempo to count in at: the set's, if it asked for one, else the song's. */
export const setlistTempo = (
  entry: SetlistEntry | null | undefined,
  songTempo: number | null | undefined
): number | null => entry?.tempo_override ?? songTempo ?? null;

/** Does this set change anything about the song? Worth showing when it does. */
export const hasOverrides = (entry: SetlistEntry | null | undefined): boolean =>
  Boolean(entry?.transpose_override || entry?.capo_override || entry?.tempo_override);
