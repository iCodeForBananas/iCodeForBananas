import { NextResponse, NextRequest } from "next/server";
import fs from "fs";
import path from "path";
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

export const dynamic = "force-dynamic";
// Extend beyond Vercel's 10s default — intraday data can have 10k–15k bars.
// Hobby tier caps at 60s; Pro/Enterprise can set up to 300s.
export const maxDuration = 60;

// Maximum bars of indicator data sent back for the chart.
// The chart's MAX_CANDLES is 1000; 2000 gives comfortable scrollback without
// bloating responses with weeks of 2-minute bars.
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

interface BacktestRequest {
  selectedFiles: string[];
  // Multi-strategy form (preferred). Each entry runs against every selected dataset.
  runs?: StrategyRun[];
  // Single-strategy form (legacy — still accepted for backward compat).
  strategyId?: string;
  paramVariations?: ParameterVariationConfig[];
  currentParams?: Record<string, number | boolean | string>;
  stopLossPercent?: number;
  takeProfitPercent?: number;
  enableShorts?: boolean;
}

// Base PricePoint fields the chart always needs (price action + prev-bar context).
const BASE_CHART_KEYS: ReadonlyArray<keyof IndicatorData> = [
  "time", "open", "high", "low", "close",
  "prevClose", "prevHigh", "prevLow",
];

// Indicator keys the chart consumes regardless of strategy params.
// `rsi` is needed for the RSI tab; ATR is used by the supertrend/keltner clients.
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

// Async so the event loop isn't blocked reading ~1MB CSV files.
async function parseCSV(filePath: string): Promise<PricePoint[]> {
  const csvText = await fs.promises.readFile(filePath, "utf-8");
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
    .filter(
      (c): c is PricePoint =>
        c !== null && !isNaN(c.time) && !isNaN(c.close)
    )
    .sort((a, b) => a.time - b.time);
}

export async function POST(request: NextRequest) {
  try {
    const body: BacktestRequest = await request.json();
    const { selectedFiles } = body;

    if (!selectedFiles?.length) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    // Normalize legacy single-strategy form into the array form.
    const runs: StrategyRun[] = body.runs?.length
      ? body.runs
      : body.strategyId
      ? [{
          strategyId: body.strategyId,
          paramVariations: body.paramVariations ?? [],
          currentParams: body.currentParams ?? {},
          stopLossPercent: body.stopLossPercent ?? 0,
          takeProfitPercent: body.takeProfitPercent ?? 0,
          enableShorts: body.enableShorts ?? false,
        }]
      : [];

    if (runs.length === 0) {
      return NextResponse.json({ success: false, error: "No strategies selected" }, { status: 400 });
    }

    for (const run of runs) {
      if (!AVAILABLE_STRATEGIES[run.strategyId]) {
        return NextResponse.json({ success: false, error: `Unknown strategy: ${run.strategyId}` }, { status: 400 });
      }
    }

    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) {
      return NextResponse.json({ success: false, error: "Data directory not found" }, { status: 500 });
    }

    // Per-strategy combinations + risk settings, computed once.
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

    // Union of indicator requirements across all selected strategies — one
    // calculateIndicatorsWithParams pass per dataset covers every run.
    // Compute per-strategy then merge so deriveRequiredIndicators routes
    // params (e.g. fastPeriod) to the right bucket for each strategy id.
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

    // Cache the trimmed indicator slice (last MAX_CHART_BARS bars) per dataset
    // during the first pass — avoids a second calculateIndicatorsWithParams
    // call after sorting. Stored wide; narrow projection happens at response build.
    const chartSliceCache = new Map<string, ReturnType<typeof calculateIndicatorsWithParams>>();

    // Process one dataset at a time to keep peak memory bounded.
    for (const datasetFile of selectedFiles) {
      const filePath = path.join(dataDir, datasetFile);
      if (!fs.existsSync(filePath)) {
        failedDatasets.push(`${datasetFile}: file not found`);
        continue;
      }

      let rawData: PricePoint[];
      try {
        rawData = await parseCSV(filePath);
      } catch (err) {
        failedDatasets.push(`${datasetFile}: ${err instanceof Error ? err.message : "parse error"}`);
        continue;
      }

      if (rawData.length === 0) {
        failedDatasets.push(`${datasetFile}: no data`);
        continue;
      }

      const dataWithIndicators = calculateIndicatorsWithParams(
        rawData,
        requiredEMAs,
        requiredSMAs,
        requiredMACDs,
        requiredDonchianPeriods
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
            run.enableShorts
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
          : dataWithIndicators
      );
    }

    batchResults.sort((a, b) => b.totalPnlPercent - a.totalPnlPercent);

    for (let i = TOP_RESULTS_WITH_FULL_DATA; i < batchResults.length; i++) {
      batchResults[i].equityCurve = [];
      batchResults[i].trades = [];
    }

    // Build the narrow set of indicator keys the chart actually renders for the
    // top-10 results. With wide param sweeps (50 EMAs etc.) this reduces the
    // payload by 5-10× since most computed EMAs are never plotted.
    const topResults = batchResults.slice(0, TOP_RESULTS_WITH_FULL_DATA);
    const top10Datasets = [...new Set(
      topResults.map((r) => r.dataset).filter((d): d is string => !!d)
    )];

    // Per-strategy chart-key derivation, then merge — same reason as the
    // run-time indicator union: deriveRequiredIndicators routes ambiguous
    // param keys (fastPeriod, slowPeriod) using strategy id heuristics.
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

    const indicatorDataByDataset: Record<string, ReturnType<typeof calculateIndicatorsWithParams>> = {};
    for (const datasetFile of top10Datasets) {
      const slice = chartSliceCache.get(datasetFile);
      if (!slice) continue;
      indicatorDataByDataset[datasetFile] = projectChartRows(slice, chartKeys);
    }

    return NextResponse.json({
      success: true,
      results: batchResults,
      indicatorDataByDataset,
      failedDatasets,
    });
  } catch (error) {
    console.error("Backtest API error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Backtest failed" },
      { status: 500 }
    );
  }
}
