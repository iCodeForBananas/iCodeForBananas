// ─── The library ────────────────────────────────────────────────────────────

export type Density = "comfortable" | "compact";

/**
 * How the library is ordered. Favorites are held at the top either way, so
 * this only decides what happens below them.
 */
export type SortOrder = "alphabetical" | "recent";

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
 * A song as the sort sees it. Favorites are a property of the song rather than
 * of the ordering, which is why they are read here and not passed in.
 */
export interface SortableEntry {
  title?: string | null;
  updated_at?: string | null;
  metadata?: { favorite?: boolean } | null;
}

const byTitle = (a: SortableEntry, b: SortableEntry): number =>
  (a.title || "Untitled").localeCompare(b.title || "Untitled", undefined, {
    sensitivity: "base",
    numeric: true,
  });

/** Newest first. An unparseable or missing timestamp sorts as the oldest. */
const byRecent = (a: SortableEntry, b: SortableEntry): number => {
  const at = Date.parse(a.updated_at ?? "");
  const bt = Date.parse(b.updated_at ?? "");
  return (Number.isNaN(bt) ? -Infinity : bt) - (Number.isNaN(at) ? -Infinity : at);
};

/**
 * The starred songs first, then everything else, each half in the chosen
 * order. Favorites sit above the sort rather than inside it: starring a song
 * is a statement that it belongs at the top whatever the rest of the list is
 * doing, and it means the set being played this month stays where a thumb
 * lands even after an edit reshuffles the library.
 *
 * Recent falls back to the title when two songs carry the same timestamp, so
 * the order is total and a re-sort never reshuffles equal rows.
 */
export function sortLibrary<T extends SortableEntry>(entries: T[], order: SortOrder): T[] {
  const within = order === "recent" ? byRecent : byTitle;
  return [...entries].sort((a, b) => {
    const aFav = a.metadata?.favorite ? 0 : 1;
    const bFav = b.metadata?.favorite ? 0 : 1;
    if (aFav !== bFav) return aFav - bFav;
    const primary = within(a, b);
    return primary !== 0 ? primary : byTitle(a, b);
  });
}

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

/** Same story as density: a preference about the person, stored once. */
const SORT_KEY = "leadsheet:sort";

export function loadSortOrder(): SortOrder {
  try {
    return window.localStorage.getItem(SORT_KEY) === "recent" ? "recent" : "alphabetical";
  } catch {
    return "alphabetical";
  }
}

export function saveSortOrder(order: SortOrder): void {
  try {
    window.localStorage.setItem(SORT_KEY, order);
  } catch {
    // Private browsing. A forgotten preference is not worth an error.
  }
}
