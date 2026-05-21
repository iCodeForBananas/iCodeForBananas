import { openDB, IDBPDatabase } from "idb";

export interface Diagram {
  id: string;
  name: string;
  code: string;
  updatedAt: number;
}

const DB_NAME = "mermaid-editor-db";
const STORE_NAME = "diagrams";
const VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

export const storage = {
  async getAll(): Promise<Diagram[]> {
    const db = await getDB();
    return db.getAll(STORE_NAME);
  },

  async save(diagram: Diagram): Promise<void> {
    const db = await getDB();
    await db.put(STORE_NAME, { ...diagram, updatedAt: Date.now() });
  },

  async delete(id: string): Promise<void> {
    const db = await getDB();
    await db.delete(STORE_NAME, id);
  },

  async getById(id: string): Promise<Diagram | undefined> {
    const db = await getDB();
    return db.get(STORE_NAME, id);
  },
};
