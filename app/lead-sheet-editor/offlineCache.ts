import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { LeadSheet } from "./shared";

interface LeadSheetCacheDB extends DBSchema {
  sheets: {
    key: string;
    value: LeadSheet;
  };
  meta: {
    key: string;
    value: { key: string; sheetIds: string[] };
  };
}

const DB_NAME = "lead-sheet-cache";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<LeadSheetCacheDB>> | null = null;

function getDb(): Promise<IDBPDatabase<LeadSheetCacheDB>> | null {
  if (typeof window === "undefined" || !("indexedDB" in window)) return null;
  if (!dbPromise) {
    dbPromise = openDB<LeadSheetCacheDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("sheets")) db.createObjectStore("sheets", { keyPath: "id" });
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
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
