import { useSyncExternalStore } from "react";
import { openDB, type IDBPDatabase } from "idb";
import type { ChordType } from "./chordVoicings";
import { STANDARD_TUNING, tuningById } from "./tunings";

/**
 * The one set of guitar settings every tool reads, saved in IndexedDB.
 *
 * IndexedDB is asynchronous, so nothing is known at first render. `ready` says
 * when the saved values have arrived; a view that draws chords waits for it,
 * rather than drawing the defaults and then visibly swapping them. Memory is the
 * source of truth once loaded and IndexedDB only mirrors it, so a browser with
 * storage blocked still gets working settings for the visit.
 */
export interface GuitarSettings {
  rootNote: string;
  chordType: ChordType;
  useFlats: boolean;
  tuningId: string;
}

const DEFAULTS: GuitarSettings = {
  rootNote: "C",
  chordType: "Major",
  useFlats: false,
  tuningId: STANDARD_TUNING.id,
};

const DB_NAME = "guitar-settings";
const STORE = "settings";
const RECORD_KEY = "current";

interface State {
  settings: GuitarSettings;
  ready: boolean;
}

/** What the server renders, and what the client hydrates against. */
const SERVER_STATE: State = { settings: DEFAULTS, ready: false };

let state = SERVER_STATE;
let started = false;
let database: Promise<IDBPDatabase> | null = null;
let otherTabs: BroadcastChannel | null = null;
const listeners = new Set<() => void>();

function publish(settings: GuitarSettings): void {
  state = { settings, ready: true };
  for (const listener of listeners) listener();
}

function openDatabase(): Promise<IDBPDatabase> {
  database ??= openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(STORE);
    },
  });
  return database;
}

async function loadSaved(): Promise<void> {
  try {
    const db = await openDatabase();
    const saved: Partial<GuitarSettings> | undefined = await db.get(STORE, RECORD_KEY);
    publish({ ...DEFAULTS, ...saved });
  } catch {
    publish(DEFAULTS);
  }
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  if (!started) {
    started = true;
    void loadSaved();
    // Another tab's change has to land here too, or this tab's next save would
    // write its stale copy over it.
    if (typeof BroadcastChannel !== "undefined") {
      otherTabs = new BroadcastChannel(DB_NAME);
      otherTabs.onmessage = (event: MessageEvent<GuitarSettings>) => publish(event.data);
    }
  }
  return () => listeners.delete(onChange);
}

/** Change some settings, everywhere, and save them. */
export function updateGuitarSettings(patch: Partial<GuitarSettings>): void {
  const settings = { ...state.settings, ...patch };
  publish(settings);
  otherTabs?.postMessage(settings);
  openDatabase()
    .then((db) => db.put(STORE, settings, RECORD_KEY))
    .catch(() => {
      // Storage blocked — the settings still work for this visit.
    });
}

export function useGuitarSettings() {
  const { settings, ready } = useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER_STATE
  );
  return { ...settings, tuning: tuningById(settings.tuningId), ready };
}
