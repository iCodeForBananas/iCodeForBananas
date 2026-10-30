/**
 * Whether the library drawer or the drums panel was last left open — two
 * independent keys, so remembering one never touches the other.
 *
 * `window` doesn't exist during SSR, and even where it does, a browser can
 * refuse storage access entirely (private browsing, a locked-down profile) —
 * either throws or is simply absent, so every path here is guarded and falls
 * back to treating the preference as unset rather than failing.
 */

export type PanelId = "library" | "drums";

/** Namespaced so nothing else in the app can collide with these two keys. */
const STORAGE_PREFIX = "leadsheet:panel:";

function keyFor(id: PanelId): string {
  return `${STORAGE_PREFIX}${id}`;
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The stored preference, or null if nothing's been saved yet (or storage isn't available). */
export function readPanelOpen(id: PanelId): boolean | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(keyFor(id));
    if (raw === "1") return true;
    if (raw === "0") return false;
    return null;
  } catch {
    return null;
  }
}

export function writePanelOpen(id: PanelId, open: boolean): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(keyFor(id), open ? "1" : "0");
  } catch {
    // Quota exceeded, private browsing, disabled — the preference just
    // won't survive a reload, which is no worse than not having one.
  }
}
