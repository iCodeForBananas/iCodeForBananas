import { NextResponse, NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { PricePoint } from "@/app/types";
import { AVAILABLE_STRATEGIES, ParameterizedResult } from "@/app/strategies";
import {
  calculateIndicatorsWithParams,
  runBacktestWithParams,
  generateCombinations,
  deriveRequiredIndicators,
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

    // Cache raw price data from the first pass so the second pass (for chart
    // indicator data) can skip re-reading the CSV files.
    const rawDataCache = new Map<string, PricePoint[]>();

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

      rawDataCache.set(datasetFile, rawData);

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
    }

    batchResults.sort((a, b) => b.totalPnlPercent - a.totalPnlPercent);

    for (let i = TOP_RESULTS_WITH_FULL_DATA; i < batchResults.length; i++) {
      batchResults[i].equityCurve = [];
      batchResults[i].trades = [];
    }

    // Build chart indicator data only for datasets that appear in the top results.
    // Reuse cached raw data to skip the second CSV read — only recalculate indicators.
    const top10Datasets = [...new Set(
      batchResults.slice(0, TOP_RESULTS_WITH_FULL_DATA)
        .map((r) => r.dataset)
        .filter((d): d is string => !!d)
    )];

    const indicatorDataByDataset: Record<string, ReturnType<typeof calculateIndicatorsWithParams>> = {};
    for (const datasetFile of top10Datasets) {
      const rawData = rawDataCache.get(datasetFile);
      if (!rawData) continue; // shouldn't happen — already validated above
      try {
        const allBars = calculateIndicatorsWithParams(
          rawData,
          requiredEMAs,
          requiredSMAs,
          requiredMACDs,
          requiredDonchianPeriods
        );
        // Cap chart data to the last MAX_CHART_BARS to keep the JSON response
        // lean on large intraday datasets (14k+ bars for 2-minute data).
        indicatorDataByDataset[datasetFile] =
          allBars.length > MAX_CHART_BARS ? allBars.slice(-MAX_CHART_BARS) : allBars;
      } catch {
        // if calculation fails, chart just won't update for this tab
      }
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
