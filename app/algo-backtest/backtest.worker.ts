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

async function fetchCsv(file: string): Promise<PricePoint[]> {
  // Workers don't have a document base, so relative URLs throw — resolve
  // against the worker's own origin (same-origin as the page that spawned it).
  const url = new URL(`/api/csv?file=${encodeURIComponent(file)}`, self.location.origin);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const csvText = await res.text();
  const lines = csvText.trim().split("\n");
  lines.shift(); // header
  return lines
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
    try {
      rawData = await fetchCsv(datasetFile);
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

    const dataWithIndicators = calculateIndicatorsWithParams(
      rawData,
      requiredEMAs,
      requiredSMAs,
      requiredMACDs,
      requiredDonchianPeriods,
    );

    for (const { run, combinations, riskSettings } of runConfigs) {
      const strategy = AVAILABLE_STRATEGIES[run.strategyId];
      report(datasetIndex, datasetFile, "running", strategy.name, true);
      for (const params of combinations) {
        const result = runBacktestWithParams(
          dataWithIndicators,
          strategy,
          params,
          INITIAL_CAPITAL,
          riskSettings,
          run.enableShorts,
        );
        batchResults.push({
          ...result,
          dataset: datasetFile,
          datasetLabel: datasetFile,
          strategyId: run.strategyId,
          strategyName: strategy.name,
        });
        completed++;
        report(datasetIndex, datasetFile, "running", strategy.name);
      }
    }

    // The whole series goes to the chart, not a recent slice: trades from
    // anywhere in the run need a bar to sit on, and the chart's replayed
    // indicators (ATR, Supertrend, RSI-2) only match the strategy's when both
    // start from the same first bar.
    chartSliceCache.set(datasetFile, dataWithIndicators);
  }

  batchResults.sort((a, b) => b.totalPnlPercent - a.totalPnlPercent);

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
    const slice = chartSliceCache.get(datasetFile);
    if (!slice) continue;
    indicatorDataByDataset[datasetFile] = projectChartRows(slice, chartKeys);
  }

  post({
    type: "done",
    jobId,
    results: batchResults,
    indicatorDataByDataset,
    failedDatasets,
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
  const rawData = await fetchCsv(job.dataset);
  const reqs = deriveRequiredIndicators(job.run.strategyId, [job.params]);
  const data = calculateIndicatorsWithParams(
    rawData,
    reqs.requiredEMAs,
    reqs.requiredSMAs,
    reqs.requiredMACDs,
    reqs.requiredDonchianPeriods,
  );
  const result = runBacktestWithParams(
    data,
    strategy,
    job.params,
    INITIAL_CAPITAL,
    riskSettingsOf(job.run),
    job.run.enableShorts,
  );
  post({
    type: "detail",
    jobId: job.jobId,
    result: { ...result, dataset: job.dataset, datasetLabel: job.dataset, strategyId: strategy.id, strategyName: strategy.name },
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
