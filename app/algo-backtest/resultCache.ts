import type { ParameterizedResult } from "@/app/strategies";
import type { SizingSettings } from "@/app/lib/backtest-engine";
import { backtestDb as db, type ResultFull, type ResultSummary } from "./backtestDb";

export type { ResultFull, ResultSummary };

/**
 * IndexedDB cache of backtest results, so re-running a variation that has
 * already run against the same data with the same code is a lookup instead
 * of a backtest.
 *
 * Two stores, because the parts of a result differ wildly in size:
 *   - `summary`: every metric, for every variation that has ever run. Small.
 *   - `full`: trades and the equity curve, kept only for results the page
 *     actually shows in detail (a batch's top results, and any detail run).
 *     A 1-minute dataset's curve is ~100k points; storing that for every
 *     variation of every sweep would run into hundreds of megabytes.
 *
 * The key is the whole input, spelled out (see resultCacheKey), so a hit can
 * only come from a run whose result would be identical.
 */

export interface ResultCacheKeyInput {
  /** Fingerprint of the code that computes results; see the worker. */
  codeVersion: string;
  dataset: string;
  /** SHA-256 of the dataset file's bytes. */
  dataHash: string;
  strategyId: string;
  params: Record<string, number | boolean | string>;
  stopLossPercent: number;
  takeProfitPercent: number;
  positionSizePercent: number;
  commissionBps: number;
  slippageBps: number;
  enableShorts: boolean;
  sizing: SizingSettings;
  initialCapital: number;
}

/**
 * Every input that can change a result, in a fixed order with params sorted
 * by key, so the same run always produces the same key and any difference at
 * all produces a different one.
 */
export function resultCacheKey(k: ResultCacheKeyInput): string {
  const sorted = <T,>(o: Record<string, T>) => Object.keys(o).sort().map((name) => [name, o[name]]);
  const params = sorted(k.params);
  return JSON.stringify([
    "v2",
    k.codeVersion,
    k.dataset,
    k.dataHash,
    k.strategyId,
    params,
    k.stopLossPercent,
    k.takeProfitPercent,
    k.positionSizePercent,
    k.commissionBps,
    k.slippageBps,
    k.enableShorts,
    sorted(k.sizing as unknown as Record<string, unknown>),
    k.initialCapital,
  ]);
}

export function toSummary(result: ParameterizedResult): ResultSummary {
  const summary: Partial<ParameterizedResult> = { ...result };
  delete summary.trades;
  delete summary.equityCurve;
  return summary as ResultSummary;
}

export function packFull(result: ParameterizedResult): ResultFull {
  const n = result.equityCurve.length;
  const times = new Float64Array(n);
  const equity = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    times[i] = result.equityCurve[i].time;
    equity[i] = result.equityCurve[i].equity;
  }
  return { trades: result.trades, times, equity };
}

export function unpackFull(summary: ResultSummary, full: ResultFull): ParameterizedResult {
  const equityCurve = new Array<{ time: number; equity: number }>(full.times.length);
  for (let i = 0; i < full.times.length; i++) {
    equityCurve[i] = { time: full.times[i], equity: full.equity[i] };
  }
  return { ...summary, trades: full.trades, equityCurve };
}

/** Summaries for `keys`, in order; undefined where there is none. */
export async function getSummaries(keys: string[]): Promise<(ResultSummary | undefined)[]> {
  if (keys.length === 0) return [];
  const tx = (await db()).transaction("summary", "readonly");
  return Promise.all(keys.map((key) => tx.store.get(key)));
}

export async function getFull(key: string): Promise<ResultFull | undefined> {
  return (await db()).get("full", key);
}

export async function putResults(
  summaries: [string, ResultSummary][],
  fulls: [string, ResultFull][] = [],
): Promise<void> {
  if (summaries.length === 0 && fulls.length === 0) return;
  const tx = (await db()).transaction(["summary", "full"], "readwrite");
  const summaryStore = tx.objectStore("summary");
  const fullStore = tx.objectStore("full");
  await Promise.all([
    ...summaries.map(([key, value]) => summaryStore.put(value, key)),
    ...fulls.map(([key, value]) => fullStore.put(value, key)),
    tx.done,
  ]);
}

/** How many variations have a cached result. */
export async function countCachedResults(): Promise<number> {
  return (await db()).count("summary");
}

export async function clearResultCache(): Promise<void> {
  const tx = (await db()).transaction(["summary", "full"], "readwrite");
  await Promise.all([tx.objectStore("summary").clear(), tx.objectStore("full").clear(), tx.done]);
}
