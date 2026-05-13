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

const MAX_CHART_BARS = 2000;
const TOP_RESULTS_WITH_FULL_DATA = 10;

interface StrategyRun {
  strategyId: string;
  paramVariations: ParameterVariationConfig[];
  currentParams: Record<string, number | boolean | string>;
  stopLossPercent: number;
  takeProfitPercent: number;
  enableShorts: boolean;
}

export interface BacktestJob {
  type: "run";
  jobId: string;
  selectedFiles: string[];
  runs: StrategyRun[];
}

export type BacktestWorkerMessage =
  | { type: "progress"; jobId: string; completed: number; total: number; currentDataset?: string }
  | {
      type: "done";
      jobId: string;
      results: ParameterizedResult[];
      indicatorDataByDataset: Record<string, IndicatorData[]>;
      failedDatasets: string[];
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
  const res = await fetch(`/api/csv?file=${encodeURIComponent(file)}`);
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
    const riskSettings: RiskSettings | undefined =
      run.stopLossPercent > 0 || run.takeProfitPercent > 0
        ? { stopLossPercent: run.stopLossPercent, takeProfitPercent: run.takeProfitPercent }
        : undefined;
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

  let completed = 0;
  const total = selectedFiles.length;

  for (const datasetFile of selectedFiles) {
    post({ type: "progress", jobId, completed, total, currentDataset: datasetFile });

    let rawData: PricePoint[];
    try {
      rawData = await fetchCsv(datasetFile);
    } catch (err) {
      failedDatasets.push(`${datasetFile}: ${err instanceof Error ? err.message : "fetch error"}`);
      completed++;
      continue;
    }

    if (rawData.length === 0) {
      failedDatasets.push(`${datasetFile}: no data`);
      completed++;
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
      }
    }

    chartSliceCache.set(
      datasetFile,
      dataWithIndicators.length > MAX_CHART_BARS
        ? dataWithIndicators.slice(-MAX_CHART_BARS)
        : dataWithIndicators,
    );

    completed++;
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

self.addEventListener("message", (event: MessageEvent<BacktestJob>) => {
  const job = event.data;
  if (!job || job.type !== "run") return;
  runJob(job).catch((err: unknown) => {
    post({
      type: "error",
      jobId: job.jobId,
      error: err instanceof Error ? err.message : "Backtest failed",
    });
  });
});
