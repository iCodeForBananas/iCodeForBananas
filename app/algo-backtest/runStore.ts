import {
  backtestDb,
  SORT_FIELDS,
  type ResultRow,
  type ResultSummary,
  type RunGroup,
  type RunMeta,
  type SortField,
} from "./backtestDb";

/**
 * A run's results live in IndexedDB, not in memory: the worker writes each
 * dataset's results as it finishes them, and the results list reads one page
 * at a time, sorted by an index on the metric it's showing. A sweep of a
 * hundred thousand variations costs the page one page of rows.
 */

export type { ResultRow, RunGroup, RunMeta, SortField };

/** A summary as a stored row: keyed by run and order, with every sort field indexable. */
export function toRow(runId: string, seq: number, summary: ResultSummary): ResultRow {
  const row = { ...summary, runId, seq, alpha: summary.totalPnlPercent - summary.buyAndHoldPnlPercent } as ResultRow;
  // An index silently skips a record whose key is invalid, and NaN never is a
  // valid key, so a NaN metric would drop the row from that sort. Infinity is
  // a valid key (a profit factor with no losing trades) and sorts last.
  for (const field of SORT_FIELDS) {
    if (typeof row[field] !== "number" || Number.isNaN(row[field])) (row as Record<SortField, number>)[field] = 0;
  }
  return row;
}

/** Tallies a row into its strategy × dataset group. */
export function addToGroups(groups: Map<string, RunGroup>, row: ResultSummary): void {
  const strategyId = row.strategyId ?? "";
  const dataset = row.dataset ?? "";
  const key = `${strategyId}\u0000${dataset}`;
  let group = groups.get(key);
  if (!group) {
    group = { strategyId, strategyName: row.strategyName ?? strategyId, dataset, total: 0, beats: 0 };
    groups.set(key, group);
  }
  group.total++;
  if (row.totalPnlPercent > row.buyAndHoldPnlPercent) group.beats++;
}

export interface RowFilter {
  strategyId?: string;
  dataset?: string;
  beatsBuyHold: boolean;
  /** At least this many closed trades. 0 or unset: any. */
  minTrades?: number;
  /** Max drawdown at most this percent. Unset: any. */
  maxDrawdownPct?: number;
  /** Total P&L above zero. */
  profitable?: boolean;
  /** P&L over the held-out last 30% above zero. */
  profitableOutOfSample?: boolean;
  /** Drop an infinite profit factor (a run with no losing trades). */
  finiteProfitFactor?: boolean;
}

type FilterFields = Pick<
  ResultRow,
  "strategyId" | "dataset" | "totalPnlPercent" | "buyAndHoldPnlPercent" | "totalTrades" | "maxDrawdownPercent" | "profitFactor"
> & { outOfSamplePnlPercent?: number };

export function matchesFilter(row: FilterFields, f: RowFilter): boolean {
  return (
    (!f.strategyId || row.strategyId === f.strategyId) &&
    (!f.dataset || row.dataset === f.dataset) &&
    (!f.beatsBuyHold || row.totalPnlPercent > row.buyAndHoldPnlPercent) &&
    (!f.minTrades || row.totalTrades >= f.minTrades) &&
    (f.maxDrawdownPct === undefined || row.maxDrawdownPercent <= f.maxDrawdownPct) &&
    (!f.profitable || row.totalPnlPercent > 0) &&
    (!f.profitableOutOfSample || (row.outOfSamplePnlPercent ?? 0) > 0) &&
    (!f.finiteProfitFactor || Number.isFinite(row.profitFactor))
  );
}

/** Whether the filter uses anything the run's group tallies can't count. */
export function needsScan(f: RowFilter): boolean {
  return !!(f.minTrades || f.maxDrawdownPct !== undefined || f.profitable || f.profitableOutOfSample || f.finiteProfitFactor);
}

/**
 * How many of a run's rows a filter matches: from the group tallies when it
 * can, else by walking the rows once (one row in memory at a time).
 */
export async function countMatching(meta: RunMeta, f: RowFilter): Promise<number> {
  if (!needsScan(f)) return filteredCount(meta, f);
  const tx = (await backtestDb()).transaction("runRows");
  let n = 0;
  for (let cursor = await tx.store.openCursor(runRange(meta.runId)); cursor; cursor = await cursor.continue()) {
    if (matchesFilter(cursor.value, f)) n++;
  }
  return n;
}

/** How many rows a filter matches, from the run's group tallies. Ignores what needsScan covers. */
export function filteredCount(meta: RunMeta, f: RowFilter): number {
  let n = 0;
  for (const g of meta.groups) {
    if (f.strategyId && g.strategyId !== f.strategyId) continue;
    if (f.dataset && g.dataset !== f.dataset) continue;
    n += f.beatsBuyHold ? g.beats : g.total;
  }
  return n;
}

const runRange = (runId: string) => IDBKeyRange.bound([runId, -Infinity], [runId, Infinity]);

export async function writeRows(rows: ResultRow[]): Promise<void> {
  if (rows.length === 0) return;
  const tx = (await backtestDb()).transaction("runRows", "readwrite");
  await Promise.all([...rows.map((row) => tx.store.put(row)), tx.done]);
}

export async function writeMeta(meta: RunMeta): Promise<void> {
  await (await backtestDb()).put("runMeta", meta);
}

export async function getMeta(runId: string): Promise<RunMeta | undefined> {
  return (await backtestDb()).get("runMeta", runId);
}

export async function deleteRun(runId: string): Promise<void> {
  const tx = (await backtestDb()).transaction(["runRows", "runMeta"], "readwrite");
  await Promise.all([tx.objectStore("runRows").delete(runRange(runId)), tx.objectStore("runMeta").delete(runId), tx.done]);
}

/**
 * Deletes runs started more than `maxAgeMs` ago. Every run writes its meta
 * before its first row, so a run that was cancelled midway still has one
 * and gets cleaned up too.
 */
export async function pruneRuns(maxAgeMs: number, keep?: string): Promise<void> {
  const cutoff = Date.now() - maxAgeMs;
  const stale = (await (await backtestDb()).getAll("runMeta")).filter((m) => m.createdAt < cutoff && m.runId !== keep);
  for (const m of stale) await deleteRun(m.runId);
}

/** Where a page ended, to start the next one just after it. */
export interface PageCursor {
  value: number;
  seq: number;
}

export interface PageQuery extends RowFilter {
  runId: string;
  field: SortField;
  direction: "asc" | "desc";
  after?: PageCursor | null;
  limit: number;
}

/**
 * One page of a run's rows in `field` order, filtered, starting just after
 * `after`. Walks the metric's index, so only the page itself is ever held.
 */
export async function queryPage(q: PageQuery): Promise<{ rows: ResultRow[]; next: PageCursor | null }> {
  const tx = (await backtestDb()).transaction("runRows");
  let cursor = await tx.store.index(q.field).openCursor(runRange(q.runId), q.direction === "desc" ? "prev" : "next");
  if (cursor && q.after) {
    const at: [string, number] = [q.runId, q.after.value];
    const pk: [string, number] = [q.runId, q.after.seq];
    cursor = await cursor.continuePrimaryKey(at, pk);
    // That lands on the previous page's last row itself; step past it.
    if (cursor && cursor.primaryKey[1] === q.after.seq) cursor = await cursor.continue();
  }
  const rows: ResultRow[] = [];
  while (cursor && rows.length < q.limit) {
    if (matchesFilter(cursor.value, q)) rows.push(cursor.value);
    cursor = await cursor.continue();
  }
  const last = rows[rows.length - 1];
  return { rows, next: cursor && last ? { value: last[q.field], seq: last.seq } : null };
}
