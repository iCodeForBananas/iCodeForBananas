/// <reference lib="webworker" />
// Web Worker that runs the entire backtest off the main thread (and off Vercel's
// 60s/1.8GB lambda). The page sends one job; the worker fetches CSVs, runs
// indicator + backtest passes, and writes the results to IndexedDB as it goes
// (see runStore.ts). Memory stays bounded by one dataset's bars plus the
// run's ten best results, however many datasets and variations the job has.

import { IndicatorData, PricePoint } from "@/app/types";
import { AVAILABLE_STRATEGIES, ParameterizedResult } from "@/app/strategies";
import {
  calculateIndicatorsWithParams,
  runBacktestWithParams,
  generateSweep,
  deriveRequiredIndicators,
  MACDConfig,
  ParameterVariationConfig,
  RiskSettings,
  SizingSettings,
  INITIAL_CAPITAL,
} from "@/app/lib/backtest-engine";
import {
  getFull,
  getSummaries,
  packFull,
  putResults,
  resultCacheKey,
  toSummary,
  unpackFull,
  type ResultFull,
  type ResultSummary,
} from "./resultCache";
import { addToGroups, deleteRun, pruneRuns, toRow, writeMeta, writeRows, type ResultRow, type RunGroup } from "./runStore";

/** Results whose trades and equity curve are kept, so opening one is a lookup. */
const TOP_RESULTS_WITH_FULL_DATA = 10;
/** Runs older than this are deleted when a new one starts. */
const RUN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface StrategyRun {
  strategyId: string;
  paramVariations: ParameterVariationConfig[];
  currentParams: Record<string, number | boolean | string>;
  stopLossPercent: number;
  takeProfitPercent: number;
  enableShorts: boolean;
  positionSizePercent: number;
  commissionBps: number;
  slippageBps: number;
  sizing: SizingSettings;
}

export interface BacktestJob {
  type: "run";
  jobId: string;
  /** Where this run's results are written; see runStore.ts. */
  runId: string;
  /** The page's previous run, whose results it no longer shows. */
  discardRunId?: string;
  selectedFiles: string[];
  runs: StrategyRun[];
}

/**
 * One result's trades, equity curve and chart rows, which a run doesn't keep
 * for every variation: holding them for thousands of variations is what ran
 * the tab out of memory. A run's top results come from the cache; anything
 * else is re-run on its own.
 */
export interface BacktestDetailJob {
  type: "detail";
  jobId: string;
  dataset: string;
  run: StrategyRun;
  params: Record<string, number | boolean | string>;
}

export type BacktestWorkerMessage =
  | {
      type: "progress";
      jobId: string;
      /** Variations finished, across every dataset and strategy. */
      completed: number;
      /** Variations in the whole job: combinations × strategies × datasets. */
      total: number;
      datasetIndex: number;
      datasetCount: number;
      currentDataset?: string;
      currentStrategy?: string;
      /** "loading" while fetching the CSV and computing indicators. */
      phase: "loading" | "running";
    }
  | {
      type: "done";
      jobId: string;
      /** The results are in IndexedDB under this run; see runStore.ts. */
      runId: string;
      total: number;
      failedDatasets: string[];
      /**
       * The server stopped answering partway (or never did), so the run
       * stopped there; every dataset from that point on is in failedDatasets.
       */
      unreachable: boolean;
      /** How many variations came from the result cache instead of running. */
      cache: { hits: number; total: number; enabled: boolean };
    }
  | {
      type: "detail";
      jobId: string;
      result: ParameterizedResult;
      indicatorData: IndicatorData[];
    }
  | { type: "error"; jobId: string; error: string };

const BASE_CHART_KEYS: ReadonlyArray<keyof IndicatorData> = [
  "time", "open", "high", "low", "close",
  "prevClose", "prevHigh", "prevLow",
];

const ALWAYS_CHART_KEYS: ReadonlyArray<keyof IndicatorData> = [
  "ema9", "ema21", "sma20", "sma50", "sma200",
  "macd", "macdSignal", "macdHistogram",
  "rsi", "atr",
  "upperBand", "lowerBand", "midLine",
];

function buildChartKeySet(req: ReturnType<typeof deriveRequiredIndicators>): Set<string> {
  const keys = new Set<string>([...BASE_CHART_KEYS, ...ALWAYS_CHART_KEYS]);
  for (const period of req.requiredEMAs) keys.add(`ema${period}`);
  for (const period of req.requiredSMAs) keys.add(`sma${period}`);
  for (const config of req.requiredMACDs as MACDConfig[]) {
    const k = `${config.fastPeriod}_${config.slowPeriod}_${config.signalPeriod}`;
    keys.add(`macd_${k}`);
    keys.add(`macdSignal_${k}`);
    keys.add(`macdHistogram_${k}`);
  }
  for (const period of req.requiredDonchianPeriods) {
    keys.add(`donchian_${period}_upperBand`);
    keys.add(`donchian_${period}_lowerBand`);
    keys.add(`donchian_${period}_midLine`);
  }
  return keys;
}

function projectChartRows(rows: IndicatorData[], keys: Set<string>): IndicatorData[] {
  return rows.map((row) => {
    const src = row as unknown as Record<string, number | undefined>;
    const out: Record<string, number | undefined> = {};
    for (const key of keys) {
      const v = src[key];
      if (v !== undefined) out[key] = v;
    }
    return out as unknown as IndicatorData;
  });
}

async function sha256(bytes: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * A fingerprint of the code that turns inputs into results: this worker and
 * every script it loaded, which between them hold the engine, every strategy
 * and their helpers. Any change to any of it — a deploy, or an edit in dev —
 * gives a new fingerprint, so the result cache misses rather than serving
 * what the old code computed. Taken once, as the worker starts, so it
 * describes the code this worker is actually running. Null when the scripts
 * can't be read, which turns the cache off for this worker.
 */
const codeVersion: Promise<string | null> = (async () => {
  try {
    const urls = new Set<string>([self.location.href]);
    for (const entry of performance.getEntriesByType("resource")) {
      if (/\.m?js$/.test(new URL(entry.name).pathname)) urls.add(entry.name);
    }
    const texts = await Promise.all(
      [...urls].sort().map(async (url) => {
        const res = await fetch(url, { cache: "force-cache" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return `${url}\n${await res.text()}`;
      }),
    );
    return await sha256(new TextEncoder().encode(texts.join("\n")));
  } catch {
    return null;
  }
})();

/**
 * fetch() rejected instead of returning a response: nothing answered at all.
 * The dev server is stopped or restarting, or the connection dropped — not a
 * problem with the file, so the run stops rather than failing every dataset
 * after it one by one.
 */
class ServerUnreachableError extends Error {
  constructor() {
    super("couldn't reach the server");
  }
}

/** Waits between attempts when a fetch gets no response. */
const FETCH_RETRY_DELAYS_MS = [500, 1500, 3000];

/** fetch(), retried a few times when nothing answers: a dev server reloading takes a moment. */
async function fetchWithRetry(url: URL): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(url);
    } catch {
      if (attempt >= FETCH_RETRY_DELAYS_MS.length) throw new ServerUnreachableError();
      await new Promise((resolve) => setTimeout(resolve, FETCH_RETRY_DELAYS_MS[attempt]));
    }
  }
}

/**
 * A dataset's bars, plus a hash of the file's bytes: its version, for the
 * result cache. Null hash if hashing isn't available, which skips the cache
 * for that dataset.
 */
async function fetchCsv(file: string): Promise<{ data: PricePoint[]; hash: string | null }> {
  // Workers don't have a document base, so relative URLs throw — resolve
  // against the worker's own origin (same-origin as the page that spawned it).
  const url = new URL(`/data/${encodeURIComponent(file)}`, self.location.origin);
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // Hash the bytes as they arrived, rather than re-encoding the decoded text:
  // one copy of the file in memory instead of two.
  const bytes = await res.arrayBuffer();
  const hash = await sha256(bytes).catch(() => null);
  const csvText = new TextDecoder().decode(bytes);
  // Walk the lines in place instead of splitting the file into an array of
  // ~100k strings first.
  const data: PricePoint[] = [];
  let start = csvText.indexOf("\n") + 1; // past the header
  while (start > 0 && start < csvText.length) {
    let end = csvText.indexOf("\n", start);
    if (end === -1) end = csvText.length;
    const values = csvText.slice(start, end).split(",");
    start = end + 1;
    if (values.length < 5) continue;
    const time = new Date(values[0]).getTime();
    const open = parseFloat(values[1]);
    const high = parseFloat(values[2]);
    const low = parseFloat(values[3]);
    const close = parseFloat(values[4]);
    // Orders fill at the next bar's open, so a bar with any unusable price
    // is dropped rather than half used.
    if (isNaN(time) || !(open > 0 && high > 0 && low > 0 && close > 0)) continue;
    data.push({ time, open, high, low, close });
  }
  data.sort((a, b) => a.time - b.time);
  return { data, hash };
}

/**
 * The best `size` results by P&L seen so far, with their trades and equity
 * curve packed. Everything else is dropped as soon as it's summarized.
 */
class TopResults {
  private items: { pnl: number; key: string; full: ResultFull }[] = [];
  constructor(private readonly size: number) {}
  wants(pnl: number): boolean {
    return this.items.length < this.size || pnl > this.items[this.items.length - 1].pnl;
  }
  add(pnl: number, key: string, full: ResultFull): void {
    this.items.push({ pnl, key, full });
    this.items.sort((a, b) => b.pnl - a.pnl);
    if (this.items.length > this.size) this.items.pop();
  }
  entries(): [string, ResultFull][] {
    return this.items.map((i) => [i.key, i.full]);
  }
}

/** The result cache key for one variation, or null when caching is off. */
function cacheKeyFor(
  version: string | null,
  dataset: string,
  dataHash: string | null,
  run: StrategyRun,
  params: Record<string, number | boolean | string>,
): string | null {
  if (!version || !dataHash) return null;
  return resultCacheKey({
    codeVersion: version,
    dataset,
    dataHash,
    strategyId: run.strategyId,
    params,
    stopLossPercent: run.stopLossPercent,
    takeProfitPercent: run.takeProfitPercent,
    positionSizePercent: run.positionSizePercent,
    commissionBps: run.commissionBps,
    slippageBps: run.slippageBps,
    enableShorts: run.enableShorts,
    sizing: run.sizing,
    initialCapital: INITIAL_CAPITAL,
  });
}

function post(message: BacktestWorkerMessage) {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(message);
}

async function runJob(job: BacktestJob): Promise<void> {
  const { jobId, runId, selectedFiles, runs } = job;

  for (const run of runs) {
    if (!AVAILABLE_STRATEGIES[run.strategyId]) {
      post({ type: "error", jobId, error: `Unknown strategy: ${run.strategyId}` });
      return;
    }
  }

  const runConfigs = runs.map((run) => {
    // Stop and target ranges sweep alongside the strategy's own parameters.
    const combinations = generateSweep(run.paramVariations, run.sizing).map((combo) => ({ ...run.currentParams, ...combo }));
    // Always pass riskSettings now — it carries position sizing + costs even
    // when SL/TP are off, which is what bounds PnL to a sensible range.
    const riskSettings = riskSettingsOf(run);
    return { run, combinations, riskSettings };
  });

  // Union of indicator requirements across all selected strategies.
  const emaSet = new Set<number>();
  const smaSet = new Set<number>();
  const donchianSet = new Set<number>();
  const macdKeySet = new Set<string>();
  for (const { run, combinations } of runConfigs) {
    const reqs = deriveRequiredIndicators(run.strategyId, combinations);
    reqs.requiredEMAs.forEach((v) => emaSet.add(v));
    reqs.requiredSMAs.forEach((v) => smaSet.add(v));
    reqs.requiredDonchianPeriods.forEach((v) => donchianSet.add(v));
    for (const m of reqs.requiredMACDs) {
      macdKeySet.add(`${m.fastPeriod}_${m.slowPeriod}_${m.signalPeriod}`);
    }
  }
  const requiredEMAs = Array.from(emaSet);
  const requiredSMAs = Array.from(smaSet);
  const requiredDonchianPeriods = Array.from(donchianSet);
  const requiredMACDs: MACDConfig[] = Array.from(macdKeySet).map((k) => {
    const [fast, slow, signal] = k.split("_").map(Number);
    return { fastPeriod: fast, slowPeriod: slow, signalPeriod: signal };
  });

  // The page's last run is no longer shown, and anything a day old is
  // leftover; neither needs its rows. The meta goes first, so a run that is
  // cancelled partway is still found and pruned later.
  if (job.discardRunId) await deleteRun(job.discardRunId).catch(() => {});
  await pruneRuns(RUN_MAX_AGE_MS, runId).catch(() => {});
  const createdAt = Date.now();
  await writeMeta({ runId, createdAt, total: 0, groups: [] });

  const failedDatasets: string[] = [];
  let unreachable = false;
  const groups = new Map<string, RunGroup>();
  const top = new TopResults(TOP_RESULTS_WITH_FULL_DATA);
  let seq = 0;
  const version = await codeVersion;
  let cacheHits = 0;

  const variationsPerDataset = runConfigs.reduce((sum, c) => sum + c.combinations.length, 0);
  const total = variationsPerDataset * selectedFiles.length;
  const datasetCount = selectedFiles.length;
  let completed = 0;

  // Posting on every variation would flood the main thread on fast runs, so
  // progress goes out at most every PROGRESS_INTERVAL_MS, plus whenever the
  // dataset or strategy changes.
  const PROGRESS_INTERVAL_MS = 80;
  let lastPost = 0;
  const report = (
    datasetIndex: number,
    currentDataset: string,
    phase: "loading" | "running",
    currentStrategy?: string,
    force = false,
  ) => {
    const now = Date.now();
    if (!force && now - lastPost < PROGRESS_INTERVAL_MS) return;
    lastPost = now;
    post({ type: "progress", jobId, completed, total, datasetIndex, datasetCount, currentDataset, currentStrategy, phase });
  };

  // One dataset at a time: its bars, indicators and results are all let go
  // before the next one is fetched.
  for (const [datasetIndex, datasetFile] of selectedFiles.entries()) {
    report(datasetIndex, datasetFile, "loading", undefined, true);

    let rawData: PricePoint[];
    let dataHash: string | null;
    try {
      ({ data: rawData, hash: dataHash } = await fetchCsv(datasetFile));
    } catch (err) {
      if (err instanceof ServerUnreachableError) {
        unreachable = true;
        for (const file of selectedFiles.slice(datasetIndex)) failedDatasets.push(`${file}: ${err.message}`);
        completed += variationsPerDataset * (selectedFiles.length - datasetIndex);
        break;
      }
      failedDatasets.push(`${datasetFile}: ${err instanceof Error ? err.message : "fetch error"}`);
      completed += variationsPerDataset;
      continue;
    }

    if (rawData.length === 0) {
      failedDatasets.push(`${datasetFile}: no data`);
      completed += variationsPerDataset;
      continue;
    }

    // Look every variation for this dataset up in one read, before computing
    // anything: indicators are only needed if something has to run.
    const entries = runConfigs.flatMap(({ run, combinations, riskSettings }) =>
      combinations.map((params) => ({
        run,
        params,
        riskSettings,
        key: cacheKeyFor(version, datasetFile, dataHash, run, params),
      })),
    );
    const keys = entries.map((e) => e.key);
    const cached: (ResultSummary | undefined)[] = keys.every((k): k is string => k !== null)
      ? await getSummaries(keys).catch(() => [])
      : [];

    let indicators: IndicatorData[] | null = null;
    const rows: ResultRow[] = [];
    const summariesToStore: [string, ResultSummary][] = [];

    for (const [i, { run, params, riskSettings, key }] of entries.entries()) {
      const strategy = AVAILABLE_STRATEGIES[run.strategyId];
      if (i === 0 || entries[i - 1].run !== run) report(datasetIndex, datasetFile, "running", strategy.name, true);
      const tags = {
        dataset: datasetFile,
        datasetLabel: datasetFile,
        strategyId: run.strategyId,
        strategyName: strategy.name,
      };
      const hit = cached[i];
      let summary: ResultSummary;
      if (hit) {
        summary = { ...hit, ...tags };
        cacheHits++;
      } else {
        indicators ??= calculateIndicatorsWithParams(rawData, requiredEMAs, requiredSMAs, requiredMACDs, requiredDonchianPeriods);
        const result: ParameterizedResult = {
          ...runBacktestWithParams(indicators, strategy, params, INITIAL_CAPITAL, riskSettings, run.enableShorts),
          ...tags,
        };
        summary = toSummary(result);
        if (key) {
          summariesToStore.push([key, summary]);
          // Only a result that makes the top ten is worth packing; the rest
          // of this one is garbage the moment the loop moves on.
          if (top.wants(result.totalPnlPercent)) top.add(result.totalPnlPercent, key, packFull(result));
        }
      }
      const row = toRow(runId, seq++, summary);
      rows.push(row);
      addToGroups(groups, row);
      completed++;
      report(datasetIndex, datasetFile, "running", strategy.name);
    }

    // This dataset's results go to disk before the next one starts, so they
    // never pile up. A failed cache write just means a later run recomputes.
    await writeRows(rows);
    await putResults(summariesToStore).catch(() => {});
  }

  // The run's best results keep their trades and equity curve, so opening
  // one is a cache lookup. A cached top result already has its entry, from
  // the run that computed it, unless that was evicted; then opening it
  // reruns that one variation.
  await putResults([], top.entries()).catch(() => {});
  await writeMeta({ runId, createdAt, total: seq, groups: [...groups.values()] });

  post({
    type: "done",
    jobId,
    runId,
    total: seq,
    failedDatasets,
    unreachable,
    cache: { hits: cacheHits, total: completed, enabled: version !== null },
  });
}

function riskSettingsOf(run: StrategyRun): RiskSettings {
  return {
    stopLossPercent: run.stopLossPercent,
    takeProfitPercent: run.takeProfitPercent,
    positionSizePercent: run.positionSizePercent,
    commissionBps: run.commissionBps,
    slippageBps: run.slippageBps,
    sizing: run.sizing,
  };
}

async function runDetail(job: BacktestDetailJob): Promise<void> {
  const strategy = AVAILABLE_STRATEGIES[job.run.strategyId];
  if (!strategy) throw new Error(`Unknown strategy: ${job.run.strategyId}`);
  const { data: rawData, hash } = await fetchCsv(job.dataset);
  const reqs = deriveRequiredIndicators(job.run.strategyId, [job.params]);
  const data = calculateIndicatorsWithParams(
    rawData,
    reqs.requiredEMAs,
    reqs.requiredSMAs,
    reqs.requiredMACDs,
    reqs.requiredDonchianPeriods,
  );
  const tags = { dataset: job.dataset, datasetLabel: job.dataset, strategyId: strategy.id, strategyName: strategy.name };
  const key = cacheKeyFor(await codeVersion, job.dataset, hash, job.run, job.params);
  let result: ParameterizedResult | null = null;
  if (key) {
    const [summary] = await getSummaries([key]).catch(() => []);
    const full = summary ? await getFull(key).catch(() => undefined) : undefined;
    if (summary && full) result = { ...unpackFull(summary, full), ...tags };
  }
  if (!result) {
    result = {
      ...runBacktestWithParams(data, strategy, job.params, INITIAL_CAPITAL, riskSettingsOf(job.run), job.run.enableShorts),
      ...tags,
    };
    if (key) void putResults([[key, toSummary(result)]], [[key, packFull(result)]]).catch(() => {});
  }
  post({
    type: "detail",
    jobId: job.jobId,
    result,
    indicatorData: projectChartRows(data, buildChartKeySet(reqs)),
  });
}

self.addEventListener("message", (event: MessageEvent<BacktestJob | BacktestDetailJob>) => {
  const job = event.data;
  if (!job) return;
  if (job.type === "detail") {
    runDetail(job).catch((err: unknown) => {
      post({ type: "error", jobId: job.jobId, error: err instanceof Error ? err.message : "Backtest failed" });
    });
    return;
  }
  if (job.type !== "run") return;
  runJob(job).catch((err: unknown) => {
    post({
      type: "error",
      jobId: job.jobId,
      error: err instanceof Error ? err.message : "Backtest failed",
    });
  });
});
