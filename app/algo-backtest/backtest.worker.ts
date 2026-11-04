/// <reference lib="webworker" />
// Web Worker that runs the entire backtest off the main thread (and off Vercel's
// 60s/1.8GB lambda). The page sends one job; the worker fetches CSVs, runs
// indicator + backtest passes, and posts back aggregated results.

import { IndicatorData, PricePoint } from "@/app/types";
import { AVAILABLE_STRATEGIES, ParameterizedResult } from "@/app/strategies";
import {
  calculateIndicatorsWithParams,
  runBacktestWithParams,
  generateCombinations,
  deriveRequiredIndicators,
  MACDConfig,
  ParameterVariationConfig,
  RiskSettings,
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

const TOP_RESULTS_WITH_FULL_DATA = 10;

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
}

export interface BacktestJob {
  type: "run";
  jobId: string;
  selectedFiles: string[];
  runs: StrategyRun[];
}

/**
 * Re-run one result on its own to get what a batch drops: its trades, equity
 * curve and chart rows. A batch keeps those for its top results only, since
 * holding them for thousands of variations would run the tab out of memory.
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
      results: ParameterizedResult[];
      indicatorDataByDataset: Record<string, IndicatorData[]>;
      failedDatasets: string[];
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

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
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
    return await sha256(texts.join("\n"));
  } catch {
    return null;
  }
})();

/**
 * A dataset's bars, plus a hash of the file's bytes: its version, for the
 * result cache. Null hash if hashing isn't available, which skips the cache
 * for that dataset.
 */
async function fetchCsv(file: string): Promise<{ data: PricePoint[]; hash: string | null }> {
  // Workers don't have a document base, so relative URLs throw — resolve
  // against the worker's own origin (same-origin as the page that spawned it).
  const url = new URL(`/data/${encodeURIComponent(file)}`, self.location.origin);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const csvText = await res.text();
  const hash = await sha256(csvText).catch(() => null);
  const lines = csvText.trim().split("\n");
  lines.shift(); // header
  const data = lines
    .map((line) => {
      const values = line.split(",");
      if (values.length < 5) return null;
      return {
        time: new Date(values[0]).getTime(),
        open: parseFloat(values[1]),
        high: parseFloat(values[2]),
        low: parseFloat(values[3]),
        close: parseFloat(values[4]),
      };
    })
    .filter((c): c is PricePoint => c !== null && !isNaN(c.time) && !isNaN(c.close))
    .sort((a, b) => a.time - b.time);
  return { data, hash };
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
    initialCapital: INITIAL_CAPITAL,
  });
}

function post(message: BacktestWorkerMessage) {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(message);
}

async function runJob(job: BacktestJob): Promise<void> {
  const { jobId, selectedFiles, runs } = job;

  for (const run of runs) {
    if (!AVAILABLE_STRATEGIES[run.strategyId]) {
      post({ type: "error", jobId, error: `Unknown strategy: ${run.strategyId}` });
      return;
    }
  }

  const runConfigs = runs.map((run) => {
    const combinations = run.paramVariations.length > 0
      ? generateCombinations(run.paramVariations).map((combo) => ({ ...run.currentParams, ...combo }))
      : [run.currentParams];
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

  const batchResults: ParameterizedResult[] = [];
  const failedDatasets: string[] = [];
  const chartSliceCache = new Map<string, ReturnType<typeof calculateIndicatorsWithParams>>();
  // Bars of datasets whose every variation was a cache hit, so indicators
  // were never computed; kept in case one of them reaches the chart.
  const rawByDataset = new Map<string, PricePoint[]>();
  const indicatorsFor = (datasetFile: string) => {
    let data = chartSliceCache.get(datasetFile);
    if (!data) {
      data = calculateIndicatorsWithParams(
        rawByDataset.get(datasetFile)!,
        requiredEMAs,
        requiredSMAs,
        requiredMACDs,
        requiredDonchianPeriods,
      );
      chartSliceCache.set(datasetFile, data);
      rawByDataset.delete(datasetFile);
    }
    return data;
  };

  const version = await codeVersion;
  let cacheHits = 0;
  // What produced each result, for storing it and for recomputing a cached
  // one whose full data is needed but wasn't kept.
  const origin = new Map<ParameterizedResult, {
    key: string | null;
    run: StrategyRun;
    params: Record<string, number | boolean | string>;
    riskSettings: RiskSettings;
    computed: boolean;
  }>();

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

  for (const [datasetIndex, datasetFile] of selectedFiles.entries()) {
    report(datasetIndex, datasetFile, "loading", undefined, true);

    let rawData: PricePoint[];
    let dataHash: string | null;
    try {
      ({ data: rawData, hash: dataHash } = await fetchCsv(datasetFile));
    } catch (err) {
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

    // The whole series goes to the chart, not a recent slice: trades from
    // anywhere in the run need a bar to sit on, and the chart's replayed
    // indicators (ATR, Supertrend, RSI-2) only match the strategy's when both
    // start from the same first bar.
    rawByDataset.set(datasetFile, rawData);

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
      let result: ParameterizedResult;
      if (hit) {
        result = { ...hit, ...tags, trades: [], equityCurve: [] };
        cacheHits++;
      } else {
        result = {
          ...runBacktestWithParams(indicatorsFor(datasetFile), strategy, params, INITIAL_CAPITAL, riskSettings, run.enableShorts),
          ...tags,
        };
      }
      origin.set(result, { key, run, params, riskSettings, computed: !hit });
      batchResults.push(result);
      completed++;
      report(datasetIndex, datasetFile, "running", strategy.name);
    }
  }

  batchResults.sort((a, b) => b.totalPnlPercent - a.totalPnlPercent);

  // Top results go back with their trades and equity curve. One that came
  // from the cache has only its summary in hand: take the rest from the full
  // store, or rerun just that variation if it was never kept.
  const fullsToStore: [string, ResultFull][] = [];
  for (let i = 0; i < Math.min(TOP_RESULTS_WITH_FULL_DATA, batchResults.length); i++) {
    const r = batchResults[i];
    const o = origin.get(r)!;
    if (o.computed) {
      if (o.key) fullsToStore.push([o.key, packFull(r)]);
      continue;
    }
    const full = await getFull(o.key!).catch(() => undefined);
    if (full) {
      batchResults[i] = unpackFull(r, full);
      continue;
    }
    const strategy = AVAILABLE_STRATEGIES[o.run.strategyId];
    const rerun: ParameterizedResult = {
      ...runBacktestWithParams(indicatorsFor(r.dataset!), strategy, o.params, INITIAL_CAPITAL, o.riskSettings, o.run.enableShorts),
      dataset: r.dataset,
      datasetLabel: r.datasetLabel,
      strategyId: r.strategyId,
      strategyName: r.strategyName,
    };
    batchResults[i] = rerun;
    fullsToStore.push([o.key!, packFull(rerun)]);
  }

  const summariesToStore: [string, ResultSummary][] = [];
  for (const [r, o] of origin) {
    if (o.computed && o.key) summariesToStore.push([o.key, toSummary(r)]);
  }

  for (let i = TOP_RESULTS_WITH_FULL_DATA; i < batchResults.length; i++) {
    batchResults[i].equityCurve = [];
    batchResults[i].trades = [];
  }

  const topResults = batchResults.slice(0, TOP_RESULTS_WITH_FULL_DATA);
  const top10Datasets = [
    ...new Set(topResults.map((r) => r.dataset).filter((d): d is string => !!d)),
  ];

  const topByStrategy = new Map<string, Record<string, number | boolean | string>[]>();
  for (const r of topResults) {
    if (!r.strategyId) continue;
    const list = topByStrategy.get(r.strategyId) ?? [];
    list.push(r.params);
    topByStrategy.set(r.strategyId, list);
  }
  const topEmaSet = new Set<number>();
  const topSmaSet = new Set<number>();
  const topDonchianSet = new Set<number>();
  const topMacdKeySet = new Set<string>();
  for (const [sid, combos] of topByStrategy) {
    const reqs = deriveRequiredIndicators(sid, combos);
    reqs.requiredEMAs.forEach((v) => topEmaSet.add(v));
    reqs.requiredSMAs.forEach((v) => topSmaSet.add(v));
    reqs.requiredDonchianPeriods.forEach((v) => topDonchianSet.add(v));
    for (const m of reqs.requiredMACDs) {
      topMacdKeySet.add(`${m.fastPeriod}_${m.slowPeriod}_${m.signalPeriod}`);
    }
  }
  const chartKeys = buildChartKeySet({
    requiredEMAs: Array.from(topEmaSet),
    requiredSMAs: Array.from(topSmaSet),
    requiredDonchianPeriods: Array.from(topDonchianSet),
    requiredMACDs: Array.from(topMacdKeySet).map((k) => {
      const [fast, slow, signal] = k.split("_").map(Number);
      return { fastPeriod: fast, slowPeriod: slow, signalPeriod: signal };
    }),
  });

  const indicatorDataByDataset: Record<string, IndicatorData[]> = {};
  for (const datasetFile of top10Datasets) {
    indicatorDataByDataset[datasetFile] = projectChartRows(indicatorsFor(datasetFile), chartKeys);
  }

  // Stored before reporting done, so a run started the moment results
  // appear already hits, and the page's cached count is current. A failed
  // write just means the next run computes these again.
  await putResults(summariesToStore, fullsToStore).catch(() => {});

  post({
    type: "done",
    jobId,
    results: batchResults,
    indicatorDataByDataset,
    failedDatasets,
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
