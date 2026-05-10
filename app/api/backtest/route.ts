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
  MAX_BATCH_RUNS,
} from "@/app/lib/backtest-engine";

export const dynamic = "force-dynamic";

interface BacktestRequest {
  strategyId: string;
  selectedFiles: string[];
  paramVariations: ParameterVariationConfig[];
  currentParams: Record<string, number | boolean | string>;
  stopLossPercent: number;
  takeProfitPercent: number;
  enableShorts: boolean;
}

function parseCSV(filePath: string): PricePoint[] {
  const csvText = fs.readFileSync(filePath, "utf-8");
  const lines = csvText.trim().split("\n");
  lines.shift(); // remove header
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

    // Build combinations — if no variations, use currentParams as the single run
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
    const indicatorDataByDataset: Record<string, ReturnType<typeof calculateIndicatorsWithParams>> = {};
    const failedDatasets: string[] = [];

    for (const datasetFile of selectedFiles) {
      const filePath = path.join(dataDir, datasetFile);
      if (!fs.existsSync(filePath)) {
        failedDatasets.push(`${datasetFile}: file not found`);
        continue;
      }

      let rawData: PricePoint[];
      try {
        rawData = parseCSV(filePath);
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

      // Store indicator data — trimmed to top 10 datasets later
      indicatorDataByDataset[datasetFile] = dataWithIndicators;

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

    // Sort by P&L descending
    batchResults.sort((a, b) => b.totalPnlPercent - a.totalPnlPercent);

    // Strip heavy arrays from results beyond the top 10 (those tabs are never shown)
    for (let i = MAX_BATCH_RUNS > 10 ? 10 : MAX_BATCH_RUNS; i < batchResults.length; i++) {
      batchResults[i].equityCurve = [];
      batchResults[i].trades = [];
    }

    // Only return indicator data for datasets that appear in the top 10 results
    const top10Datasets = new Set(batchResults.slice(0, 10).map((r) => r.dataset).filter(Boolean) as string[]);
    const filteredIndicatorData: Record<string, ReturnType<typeof calculateIndicatorsWithParams>> = {};
    for (const ds of top10Datasets) {
      if (indicatorDataByDataset[ds]) {
        filteredIndicatorData[ds] = indicatorDataByDataset[ds];
      }
    }

    return NextResponse.json({
      success: true,
      results: batchResults,
      indicatorDataByDataset: filteredIndicatorData,
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
