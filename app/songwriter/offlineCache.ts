import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { LeadSheet } from "./shared";

/**
 * An edit that hasn't reached Supabase yet — the Freeform editor's
 * continuous autosave, queued locally the moment it's made rather than
 * only after a write succeeds. This is what survives a closed tab or a
 * dropped connection: the editor reads this back before it ever shows a
 * stale server copy as current.
 *
 * `baseUpdatedAt` is the server's `updated_at` this edit assumed as its
 * starting point — the thing that makes a conflict detectable. If the row's
 * actual `updated_at` no longer matches this by the time the edit tries to
 * land, something else wrote to this sheet in between, and the save must
 * stop and ask rather than overwrite it.
 */
export interface PendingEdit {
  id: string;
  rawText: string;
  capo: number | null;
  baseUpdatedAt: string | null;
  queuedAt: string;
}

interface LeadSheetCacheDB extends DBSchema {
  sheets: {
    key: string;
    value: LeadSheet;
  };
  meta: {
    key: string;
    value: { key: string; sheetIds: string[] };
  };
  pending: {
    key: string;
    value: PendingEdit;
  };
}

const DB_NAME = "lead-sheet-cache";
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<LeadSheetCacheDB>> | null = null;

function getDb(): Promise<IDBPDatabase<LeadSheetCacheDB>> | null {
  if (typeof window === "undefined" || !("indexedDB" in window)) return null;
  if (!dbPromise) {
    dbPromise = openDB<LeadSheetCacheDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("sheets")) db.createObjectStore("sheets", { keyPath: "id" });
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
        if (!db.objectStoreNames.contains("pending")) db.createObjectStore("pending", { keyPath: "id" });
      },
    });
  }
  return dbPromise;
}

// Supabase is always the source of truth — these helpers only exist so the
// editor can still open songs while offline.

export async function cacheSheet(sheet: LeadSheet): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.put("sheets", sheet);
}

export async function getCachedSheet(id: string): Promise<LeadSheet | null> {
  const db = await getDb();
  if (!db) return null;
  return (await db.get("sheets", id)) ?? null;
}

export async function cacheSheetList(sheets: LeadSheet[]): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const tx = db.transaction("sheets", "readwrite");
  await Promise.all([...sheets.map((sheet) => tx.store.put(sheet)), tx.done]);
  await db.put("meta", { key: "list", sheetIds: sheets.map((s) => s.id) });
}

export async function getCachedSheetList(): Promise<LeadSheet[] | null> {
  const db = await getDb();
  if (!db) return null;
  const meta = await db.get("meta", "list");
  if (!meta) return null;
  const sheets = await Promise.all(meta.sheetIds.map((id) => db.get("sheets", id)));
  return sheets
    .filter((s): s is LeadSheet => !!s)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
}

/**
 * Which songs have an offline copy right now, so the library can say so
 * before you lose signal rather than after. Folds in sheets cached one at a
 * time (opened directly, e.g. from a share link) as well as the last
 * successful library sync, so a sheet doesn't have to have gone through both
 * paths to count.
 */
export async function getCachedSheetIds(): Promise<Set<string>> {
  const db = await getDb();
  if (!db) return new Set();
  const [meta, keys] = await Promise.all([db.get("meta", "list"), db.getAllKeys("sheets")]);
  return new Set([...(meta?.sheetIds ?? []), ...keys]);
}

// ── Pending edits ──────────────────────────────────────────────────────────

export async function queuePendingEdit(
  id: string,
  rawText: string,
  capo: number | null,
  baseUpdatedAt: string | null
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.put("pending", { id, rawText, capo, baseUpdatedAt, queuedAt: new Date().toISOString() });
}

export async function getPendingEdit(id: string): Promise<PendingEdit | null> {
  const db = await getDb();
  if (!db) return null;
  return (await db.get("pending", id)) ?? null;
}

export async function clearPendingEdit(id: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete("pending", id);
}

/** Every song with edits that haven't reached Supabase yet. */
export async function getAllPendingEdits(): Promise<PendingEdit[]> {
  const db = await getDb();
  if (!db) return [];
  return db.getAll("pending");
}
