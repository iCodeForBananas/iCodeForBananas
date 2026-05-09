// ─── Types ────────────────────────────────────────────────────

export interface PracticeBlock {
  id: string;
  title: string;
  description: string;
  durationMinutes: number;
  toolLink?: { label: string; href: string };
  completed: boolean;
  skipped: boolean;
}

export interface PracticeSession {
  id: string;
  date: string; // ISO string
  goal: string;
  totalMinutes: number;
  skillLevel: "beginner" | "intermediate" | "advanced";
  blocks: PracticeBlock[];
  summary?: string;
  rating?: "too-easy" | "just-right" | "too-hard";
}

// ─── IndexedDB ────────────────────────────────────────────────

const DB_NAME = "practiceCoachDB";
const DB_VERSION = 1;
const SESSIONS_STORE = "sessions";
const ACTIVE_STORE = "activeSession";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(SESSIONS_STORE, { keyPath: "id" });
      req.result.createObjectStore(ACTIVE_STORE, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, "readonly").objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, store: string, value: object): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, "readwrite").objectStore(store).put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(db: IDBDatabase, store: string, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, "readwrite").objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbGetAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, "readonly").objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

// ─── Session History ──────────────────────────────────────────

export async function loadSessions(): Promise<PracticeSession[]> {
  const db = await openDB();
  const all = await idbGetAll<PracticeSession>(db, SESSIONS_STORE);
  return all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export async function saveSession(session: PracticeSession): Promise<void> {
  const db = await openDB();
  await idbPut(db, SESSIONS_STORE, session);
}

export async function deleteSession(id: string): Promise<void> {
  const db = await openDB();
  await idbDelete(db, SESSIONS_STORE, id);
}

// ─── Active Session (persists across navigation/refresh) ──────

export async function loadActiveSession(): Promise<PracticeSession | null> {
  const db = await openDB();
  const record = await idbGet<{ key: string; session: PracticeSession }>(db, ACTIVE_STORE, "current");
  return record?.session ?? null;
}

export async function persistActiveSession(session: PracticeSession): Promise<void> {
  const db = await openDB();
  await idbPut(db, ACTIVE_STORE, { key: "current", session });
}

export async function clearActiveSession(): Promise<void> {
  const db = await openDB();
  await idbDelete(db, ACTIVE_STORE, "current");
}

// ─── Helpers ──────────────────────────────────────────────────

export function sessionStats(sessions: PracticeSession[]) {
  const completed = sessions.filter((s) => s.blocks.every((b) => b.completed || b.skipped));
  const totalMinutes = sessions.reduce((acc, s) => acc + s.totalMinutes, 0);
  return { total: sessions.length, completed: completed.length, totalMinutes };
}
