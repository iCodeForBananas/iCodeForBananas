import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { ParameterizedResult } from "@/app/strategies";

/**
 * The backtester's IndexedDB database, shared by the page and the worker.
 *
 *   - `summary` / `full`: the result cache (see resultCache.ts). Survives
 *     across runs; the Clear cache button empties it.
 *   - `runRows` / `runMeta`: the results of a run (see runStore.ts), written
 *     by the worker as it goes and paged by the results list, so a run's
 *     results never have to sit in memory all at once.
 */

/** A result minus its trades and equity curve. */
export type ResultSummary = Omit<ParameterizedResult, "trades" | "equityCurve">;

export interface ResultFull {
  trades: ParameterizedResult["trades"];
  /** Equity curve as two parallel columns; far smaller than {time, equity}[]. */
  times: Float64Array;
  equity: Float64Array;
}

/** One result of a run, as the results list reads it. */
export type ResultRow = ResultSummary & {
  runId: string;
  /** Order the result was produced in; with runId, its key. */
  seq: number;
  /** totalPnlPercent − buyAndHoldPnlPercent, stored so it can be indexed. */
  alpha: number;
  /** Always set on a stored row (0 for results from before the split), so they index. */
  inSamplePnlPercent: number;
  outOfSamplePnlPercent: number;
};

/** Results per strategy × dataset, so filtered counts never need a scan. */
export interface RunGroup {
  strategyId: string;
  strategyName: string;
  dataset: string;
  total: number;
  /** How many beat buy & hold. */
  beats: number;
}

export interface RunMeta {
  runId: string;
  createdAt: number;
  total: number;
  groups: RunGroup[];
}

/** Every metric the results list can sort by; each gets an index. */
export const SORT_FIELDS = [
  "totalPnlPercent",
  "buyAndHoldPnlPercent",
  "alpha",
  "winRate",
  "profitFactor",
  "maxDrawdownPercent",
  "sharpeRatio",
  "totalTrades",
  "averageWin",
  "averageLoss",
  "inSamplePnlPercent",
  "outOfSamplePnlPercent",
] as const;
/** Sort fields added after version 2 created the runRows store. */
const FIELDS_ADDED_IN_V3: SortField[] = ["inSamplePnlPercent", "outOfSamplePnlPercent"];
export type SortField = (typeof SORT_FIELDS)[number];

interface BacktestDB extends DBSchema {
  summary: { key: string; value: ResultSummary };
  full: { key: string; value: ResultFull };
  runRows: {
    key: [string, number];
    value: ResultRow;
    indexes: { [F in SortField]: [string, number] };
  };
  runMeta: { key: string; value: RunMeta };
}

const DB_NAME = "algo-backtest-results";
const DB_VERSION = 3;

let dbPromise: Promise<IDBPDatabase<BacktestDB>> | null = null;

export function backtestDb(): Promise<IDBPDatabase<BacktestDB>> {
  if (!dbPromise) {
    dbPromise = openDB<BacktestDB>(DB_NAME, DB_VERSION, {
      upgrade(database, oldVersion, _newVersion, transaction) {
        if (oldVersion < 1) {
          database.createObjectStore("summary");
          database.createObjectStore("full");
        }
        if (oldVersion < 2) {
          const rows = database.createObjectStore("runRows", { keyPath: ["runId", "seq"] });
          for (const field of SORT_FIELDS) rows.createIndex(field, ["runId", field]);
          database.createObjectStore("runMeta", { keyPath: "runId" });
        } else if (oldVersion < 3) {
          const rows = transaction.objectStore("runRows");
          for (const field of FIELDS_ADDED_IN_V3) rows.createIndex(field, ["runId", field]);
        }
      },
      // Another tab holding an older version open would block this upgrade
      // forever; closing on versionchange lets the newer page proceed.
      blocking() {
        void dbPromise?.then((d) => d.close());
        dbPromise = null;
      },
    });
    // A failed open (private mode, blocked storage) shouldn't stick: let the
    // next call try again rather than caching the rejection forever.
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}
