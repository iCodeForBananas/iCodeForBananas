"use client";

// Local-first arrangement track storage.
// IndexedDB is primary (works offline); Supabase is cloud sync target.

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LocalTrack {
  id:          string;
  sheetId:     string;
  name:        string;
  type:        "guitar" | "vocals" | "other";
  mimeType:    string;
  blob:        Blob;
  durationSec: number;
  volume:      number;        // 0–1
  muted:       boolean;
  offsetMs:    number;        // latency compensation (playback start shift)
  createdAt:   number;        // Date.now()
  syncedAt:    number | null; // null = pending sync
  storagePath: string | null; // Supabase storage path once synced
}

// ── IndexedDB ─────────────────────────────────────────────────────────────────

const DB_NAME = "iCFB_arrangements";
const DB_VER  = 1;
const STORE   = "tracks";

let _db: IDBDatabase | null = null;

async function openDB(): Promise<IDBDatabase> {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("sheetId",  "sheetId",  { unique: false });
    };
    req.onsuccess = () => { _db = req.result; resolve(_db!); };
    req.onerror   = () => reject(req.error);
  });
}

export async function getTracksForSheet(sheetId: string): Promise<LocalTrack[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly")
      .objectStore(STORE).index("sheetId").getAll(sheetId);
    req.onsuccess = () =>
      resolve((req.result as LocalTrack[]).sort((a, b) => a.createdAt - b.createdAt));
    req.onerror = () => reject(req.error);
  });
}

export async function saveTrack(track: LocalTrack): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(track);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

export async function updateTrackMeta(
  id: string,
  patch: Partial<Omit<LocalTrack, "id" | "sheetId" | "blob">>,
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const get   = store.get(id);
    get.onsuccess = () => {
      const t = get.result as LocalTrack | undefined;
      if (t) store.put({ ...t, ...patch });
    };
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

export async function removeTrackFromDB(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function getUnsyncedTracks(): Promise<LocalTrack[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    req.onsuccess = () =>
      resolve((req.result as LocalTrack[]).filter(t => t.syncedAt === null));
    req.onerror = () => reject(req.error);
  });
}

// ── Supabase sync ─────────────────────────────────────────────────────────────

function mimeToExt(mime: string): string {
  if (mime.startsWith("audio/mp4"))  return "m4a";
  if (mime.startsWith("audio/ogg"))  return "ogg";
  return "webm";
}

/** Upload any unsynced local tracks to Supabase. Safe to call repeatedly. */
export async function syncToSupabase(): Promise<void> {
  if (typeof window === "undefined") return;
  const { createClient } = await import("@/utils/supabase/client");
  const sb = createClient();
  if (!sb) return;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;

  for (const track of await getUnsyncedTracks()) {
    const ext  = mimeToExt(track.mimeType);
    const path = `${user.id}/${track.sheetId}/${track.id}.${ext}`;

    const { error: upErr } = await sb.storage
      .from("arrangements")
      .upload(path, track.blob, { contentType: track.mimeType, upsert: true });
    if (upErr) { console.warn("[arrangement] upload failed", upErr.message); continue; }

    const { error: dbErr } = await sb.from("arrangement_tracks").upsert({
      id:           track.id,
      sheet_id:     track.sheetId,
      user_id:      user.id,
      name:         track.name,
      type:         track.type,
      mime_type:    track.mimeType,
      storage_path: path,
      duration_sec: track.durationSec,
      volume:       track.volume,
      muted:        track.muted,
      offset_ms:    track.offsetMs,
      created_at:   new Date(track.createdAt).toISOString(),
    });
    if (dbErr) { console.warn("[arrangement] db upsert failed", dbErr.message); continue; }

    await updateTrackMeta(track.id, { syncedAt: Date.now(), storagePath: path });
  }
}

/** Pull tracks from Supabase that aren't in local IndexedDB. */
export async function fetchFromSupabase(sheetId: string): Promise<void> {
  if (typeof window === "undefined") return;
  const { createClient } = await import("@/utils/supabase/client");
  const sb = createClient();
  if (!sb) return;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;

  const { data: rows, error } = await sb
    .from("arrangement_tracks")
    .select("*")
    .eq("sheet_id", sheetId)
    .order("created_at");
  if (error || !rows) return;

  const local    = await getTracksForSheet(sheetId);
  const localIds = new Set(local.map(t => t.id));

  for (const row of rows) {
    if (localIds.has(row.id)) continue;

    const { data: blob, error: dlErr } = await sb.storage
      .from("arrangements")
      .download(row.storage_path);
    if (dlErr || !blob) { console.warn("[arrangement] download failed", dlErr?.message); continue; }

    await saveTrack({
      id:          row.id,
      sheetId:     row.sheet_id,
      name:        row.name,
      type:        row.type as LocalTrack["type"],
      mimeType:    row.mime_type ?? "audio/webm",
      blob,
      durationSec: row.duration_sec,
      volume:      row.volume,
      muted:       row.muted,
      offsetMs:    row.offset_ms,
      createdAt:   new Date(row.created_at).getTime(),
      syncedAt:    Date.now(),
      storagePath: row.storage_path,
    });
  }
}

/** Delete a track from Supabase (if synced) and from local IndexedDB. */
export async function deleteTrackEverywhere(track: LocalTrack): Promise<void> {
  if (track.storagePath) {
    const { createClient } = await import("@/utils/supabase/client");
    const sb = createClient();
    if (sb) {
      await sb.storage.from("arrangements").remove([track.storagePath]);
      await sb.from("arrangement_tracks").delete().eq("id", track.id);
    }
  }
  await removeTrackFromDB(track.id);
}
