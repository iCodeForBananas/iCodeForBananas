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

interface BacktestRequest {
  strategyId: string;
  selectedFiles: string[];
  paramVariations: ParameterVariationConfig[];
  currentParams: Record<string, number | boolean | string>;
  stopLossPercent: number;
  takeProfitPercent: number;
  enableShorts: boolean;
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
    const {
      strategyId,
      selectedFiles,
      paramVariations,
      currentParams,
      stopLossPercent,
      takeProfitPercent,
      enableShorts,
    } = body;

    if (!strategyId || !selectedFiles?.length) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    const strategy = AVAILABLE_STRATEGIES[strategyId];
    if (!strategy) {
      return NextResponse.json({ success: false, error: `Unknown strategy: ${strategyId}` }, { status: 400 });
    }

    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) {
      return NextResponse.json({ success: false, error: "Data directory not found" }, { status: 500 });
    }

    const combinations = paramVariations.length > 0
      ? generateCombinations(paramVariations).map((combo) => ({ ...currentParams, ...combo }))
      : [currentParams];

    const { requiredEMAs, requiredSMAs, requiredMACDs, requiredDonchianPeriods } =
      deriveRequiredIndicators(strategyId, combinations);

    const riskSettings: RiskSettings | undefined =
      stopLossPercent > 0 || takeProfitPercent > 0
        ? { stopLossPercent, takeProfitPercent }
        : undefined;

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

      for (const params of combinations) {
        const result = runBacktestWithParams(
          dataWithIndicators,
          strategy,
          params,
          INITIAL_CAPITAL,
          riskSettings,
          enableShorts
        );
        batchResults.push({ ...result, dataset: datasetFile, datasetLabel: datasetFile });
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

    const topCombos = topResults.map((r) => r.params);
    const topIndicators = deriveRequiredIndicators(strategyId, topCombos);
    const chartKeys = buildChartKeySet(topIndicators);

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
