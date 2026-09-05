// ─── Visibility, forking and attribution ────────────────────────────────────

export type Visibility = "private" | "unlisted" | "public";

export const VISIBILITIES: { value: Visibility; label: string; help: string }[] = [
  { value: "private", label: "Private", help: "Only you can open it." },
  { value: "unlisted", label: "Unlisted", help: "Anyone with the link can open it. It is not listed anywhere." },
  { value: "public", label: "Public", help: "Anyone can find it, open it, and copy it into their own library." },
];

/** Readable by someone who is not the owner? */
export const isShared = (visibility: Visibility): boolean => visibility !== "private";

/** Copyable by someone else? Unlisted is shared, not offered up. */
export const isForkable = (visibility: Visibility): boolean => visibility === "public";

export interface ForkSource {
  id: string;
  title?: string | null;
  artist?: string | null;
  key?: string | null;
  tempo?: number | null;
  capo?: number | null;
  time_signature?: string | null;
  chordpro?: string | null;
  sections?: unknown;
  metadata?: unknown;
  visibility?: Visibility;
  /** The name to credit. Resolved by the caller, which knows about accounts. */
  author_name?: string | null;
}

export interface ForkRow {
  user_id: string;
  title: string;
  artist: string | null;
  key: string;
  tempo: number | null;
  capo: number | null;
  time_signature: string | null;
  chordpro: string | null;
  sections: unknown;
  metadata: unknown;
  visibility: Visibility;
  forked_from_id: string;
  forked_from_title: string | null;
  forked_from_author: string | null;
}

/**
 * The row a "Duplicate to my library" makes.
 *
 * Three things are deliberately not copied. Visibility resets to private,
 * because inheriting "public" would republish someone else's song under a new
 * name without anyone choosing to. Revision history stays with the original,
 * since it is a record of what that person did rather than of this copy. And
 * comments stay too, for the same reason.
 *
 * Provenance names the version this was taken from, not the root of the chain.
 * A fork of a fork credits the one it was copied from and points at it, so the
 * chain stays walkable rather than collapsing into a single claimed origin.
 */
export function forkRow(source: ForkSource, userId: string): ForkRow {
  return {
    user_id: userId,
    title: source.title || "Untitled",
    artist: source.artist ?? null,
    key: source.key ?? "",
    tempo: source.tempo ?? null,
    capo: source.capo ?? null,
    time_signature: source.time_signature ?? null,
    chordpro: source.chordpro ?? null,
    sections: source.sections ?? [],
    metadata: source.metadata ?? {},
    visibility: "private",
    forked_from_id: source.id,
    forked_from_title: source.title ?? null,
    forked_from_author: source.author_name ?? null,
  };
}

export interface Provenance {
  forked_from_id?: string | null;
  forked_from_title?: string | null;
  forked_from_author?: string | null;
}

/**
 * The credit line a forked song carries. Null when the song is nobody else's.
 *
 * The title and author are stored on the copy rather than read through the
 * link, so the credit survives the original being deleted or made private.
 */
export function attribution(song: Provenance): string | null {
  if (!song.forked_from_id) return null;
  const title = song.forked_from_title;
  const author = song.forked_from_author;
  if (title && author) return `Based on "${title}" by ${author}`;
  if (title) return `Based on "${title}"`;
  if (author) return `Based on a song by ${author}`;
  return "Based on someone else's song";
}
