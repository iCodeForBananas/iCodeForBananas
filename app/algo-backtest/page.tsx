"use client";

import React, { useState, useEffect, useCallback } from "react";
import BacktestChart from "../components/BacktestChart";
import EquityCurveChart from "../components/EquityCurveChart";
import { PricePoint, IndicatorData, BacktestTrade, PositionSide } from "@/app/types";
import {
  AVAILABLE_STRATEGIES,
  StrategyDefinition,
  getDefaultParams,
  createParamLabel,
  ParameterizedResult,
} from "@/app/strategies";
import LambdaExportModal from "../components/LambdaExportModal";

const DEFAULT_VISIBLE_CANDLES = 300;
const INITIAL_CAPITAL = 100000;
const MAX_BATCH_RUNS = 50;

interface DatasetInfo {
  file: string;
  symbol: string;
  timeframe: string;
  date: string;
  label: string;
}

interface ParameterVariationConfig {
  key: string;
  min: number;
  max: number;
  step: number;
}

// MACD configuration type
interface MACDConfig {
  fastPeriod: number;
  slowPeriod: number;
  signalPeriod: number;
}

// Calculate indicators dynamically based on required periods
function calculateIndicatorsWithParams(
  data: PricePoint[],
  requiredEMAs: number[],
  requiredSMAs: number[],
  requiredMACDs: MACDConfig[] = [{ fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }]
): IndicatorData[] {
  const result: IndicatorData[] = [];

  const calcSMA = (values: number[], period: number): number | undefined => {
    if (values.length < period) return undefined;
    return values.slice(-period).reduce((a, b) => a + b, 0) / period;
  };

  const closePrices: number[] = [];

  // Track EMA values for each required period
  const emaState: Record<number, number | undefined> = {};
  for (const period of requiredEMAs) {
    emaState[period] = undefined;
  }

  // For RSI
  let avgGain = 0;
  let avgLoss = 0;
  const rsiPeriod = 14;

  // For MACD (dynamic configurations)
  // Track state for each MACD configuration: { fast, slow, signal } -> { fastEma, slowEma, signalEma }
  const macdState: Map<string, { fastEma: number | undefined; slowEma: number | undefined; signalEma: number | undefined }> = new Map();
  for (const config of requiredMACDs) {
    const key = `${config.fastPeriod}_${config.slowPeriod}_${config.signalPeriod}`;
    macdState.set(key, { fastEma: undefined, slowEma: undefined, signalEma: undefined });
  }

  // For ATR
  const trValues: number[] = [];
  const atrPeriod = 14;

  // For Donchian
  const donchianPeriod = 20;

  for (let i = 0; i < data.length; i++) {
    const candle = data[i];
    closePrices.push(candle.close);

    const indicatorData: IndicatorData = { ...candle };

    // Previous data
    if (i > 0) {
      indicatorData.prevClose = data[i - 1].close;
      indicatorData.prevHigh = data[i - 1].high;
      indicatorData.prevLow = data[i - 1].low;
    }

    // Standard SMAs (always computed)
    indicatorData.sma20 = calcSMA(closePrices, 20);
    indicatorData.sma50 = calcSMA(closePrices, 50);
    indicatorData.sma200 = calcSMA(closePrices, 200);

    // Dynamic SMAs based on required periods
    for (const period of requiredSMAs) {
      indicatorData[`sma${period}`] = calcSMA(closePrices, period);
    }

    // Dynamic EMAs for all required periods
    for (const period of requiredEMAs) {
      const multiplier = 2 / (period + 1);
      if (i === 0) {
        emaState[period] = candle.close;
      } else {
        const prevEma = emaState[period];
        if (prevEma !== undefined) {
          emaState[period] = (candle.close - prevEma) * multiplier + prevEma;
        }
      }
      indicatorData[`ema${period}`] = emaState[period];
    }

    // Standard EMAs (always include 9 and 21)
    indicatorData.ema9 = emaState[9];
    indicatorData.ema21 = emaState[21];

    // RSI
    if (i > 0) {
      const change = candle.close - data[i - 1].close;
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? -change : 0;

      if (i < rsiPeriod) {
        avgGain += gain;
        avgLoss += loss;
      } else if (i === rsiPeriod) {
        avgGain = avgGain / rsiPeriod;
        avgLoss = avgLoss / rsiPeriod;
      } else {
        avgGain = (avgGain * (rsiPeriod - 1) + gain) / rsiPeriod;
        avgLoss = (avgLoss * (rsiPeriod - 1) + loss) / rsiPeriod;
      }

      if (i >= rsiPeriod) {
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        indicatorData.rsi = 100 - 100 / (1 + rs);
      }
    }

    // MACD (dynamic configurations)
    for (const config of requiredMACDs) {
      const key = `${config.fastPeriod}_${config.slowPeriod}_${config.signalPeriod}`;
      const state = macdState.get(key);
      if (!state) continue;

      const fastMultiplier = 2 / (config.fastPeriod + 1);
      const slowMultiplier = 2 / (config.slowPeriod + 1);
      
      if (i === 0) {
        state.fastEma = candle.close;
        state.slowEma = candle.close;
      } else {
        if (state.fastEma !== undefined) {
          state.fastEma = (candle.close - state.fastEma) * fastMultiplier + state.fastEma;
        }
        if (state.slowEma !== undefined) {
          state.slowEma = (candle.close - state.slowEma) * slowMultiplier + state.slowEma;
        }
      }

      if (state.fastEma !== undefined && state.slowEma !== undefined && i >= config.slowPeriod) {
        const macdValue = state.fastEma - state.slowEma;
        indicatorData[`macd_${key}` as `macd_${number}_${number}_${number}`] = macdValue;

        const signalMultiplier = 2 / (config.signalPeriod + 1);
        if (state.signalEma === undefined) {
          state.signalEma = macdValue;
        } else {
          state.signalEma = (macdValue - state.signalEma) * signalMultiplier + state.signalEma;
        }
        indicatorData[`macdSignal_${key}` as `macdSignal_${number}_${number}_${number}`] = state.signalEma;
        
        if (state.signalEma !== undefined) {
          indicatorData[`macdHistogram_${key}` as `macdHistogram_${number}_${number}_${number}`] = macdValue - state.signalEma;
        }
      }

      // Also populate the default macd, macdSignal, macdHistogram for backward compatibility
      if (config.fastPeriod === 12 && config.slowPeriod === 26 && config.signalPeriod === 9) {
        indicatorData.macd = indicatorData[`macd_${key}` as `macd_${number}_${number}_${number}`];
        indicatorData.macdSignal = indicatorData[`macdSignal_${key}` as `macdSignal_${number}_${number}_${number}`];
        indicatorData.macdHistogram = indicatorData[`macdHistogram_${key}` as `macdHistogram_${number}_${number}_${number}`];
      }
    }

    // ATR
    if (i > 0) {
      const tr = Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - data[i - 1].close),
        Math.abs(candle.low - data[i - 1].close)
      );
      trValues.push(tr);
      if (trValues.length >= atrPeriod) {
        indicatorData.atr = trValues.slice(-atrPeriod).reduce((a, b) => a + b, 0) / atrPeriod;
      }
    }

    // Donchian Channels
    if (i >= donchianPeriod - 1) {
      const slice = data.slice(i - donchianPeriod + 1, i + 1);
      indicatorData.upperBand = Math.max(...slice.map((d) => d.high));
      indicatorData.lowerBand = Math.min(...slice.map((d) => d.low));
      indicatorData.midLine = (indicatorData.upperBand + indicatorData.lowerBand) / 2;
    }

    result.push(indicatorData);
  }

  return result;
}

// Run backtest with given strategy and parameters
function runBacktestWithParams(
  data: IndicatorData[],
  strategy: StrategyDefinition,
  params: Record<string, number | boolean | string>,
  initialCapital: number
): ParameterizedResult {
  const trades: BacktestTrade[] = [];
  const equityCurve: { time: number; equity: number }[] = [];
  let equity = initialCapital;
  let position: { side: PositionSide; entryPrice: number; entryTime: number; entryIdx: number } | null = null;
  let tradeId = 1;

  // Run through the data
  for (let i = 1; i < data.length; i++) {
    const current = data[i];
    const previous = data[i - 1];

    const signal = strategy.handler({
      current,
      previous,
      index: i,
      series: data.slice(0, i + 1),
      params,
    });

    if (signal.action === "buy" && !position) {
      position = {
        side: PositionSide.LONG,
        entryPrice: current.close,
        entryTime: current.time,
        entryIdx: i,
      };
    } else if (signal.action === "sell" && position) {
      const pnl =
        position.side === PositionSide.LONG
          ? (current.close - position.entryPrice) * (equity / position.entryPrice)
          : (position.entryPrice - current.close) * (equity / position.entryPrice);
      const pnlPercent =
        ((current.close - position.entryPrice) / position.entryPrice) *
        100 *
        (position.side === PositionSide.LONG ? 1 : -1);

      equity += pnl;

      trades.push({
        id: `trade-${tradeId++}`,
        side: position.side,
        entryPrice: position.entryPrice,
        entryTime: position.entryTime,
        exitPrice: current.close,
        exitTime: current.time,
        pnl,
        pnlPercent,
        reason: signal.reason,
      });

      position = null;
    }

    equityCurve.push({ time: current.time, equity });
  }

  // Close any open position at end
  if (position && data.length > 0) {
    const lastCandle = data[data.length - 1];
    const pnl =
      position.side === PositionSide.LONG
        ? (lastCandle.close - position.entryPrice) * (equity / position.entryPrice)
        : (position.entryPrice - lastCandle.close) * (equity / position.entryPrice);
    const pnlPercent =
      ((lastCandle.close - position.entryPrice) / position.entryPrice) *
      100 *
      (position.side === PositionSide.LONG ? 1 : -1);

    equity += pnl;

    trades.push({
      id: `trade-${tradeId++}`,
      side: position.side,
      entryPrice: position.entryPrice,
      entryTime: position.entryTime,
      exitPrice: lastCandle.close,
      exitTime: lastCandle.time,
      pnl,
      pnlPercent,
      reason: "End of data",
    });
  }

  // Calculate statistics
  const winningTrades = trades.filter((t) => t.pnl > 0);
  const losingTrades = trades.filter((t) => t.pnl <= 0);
  const totalPnl = equity - initialCapital;
  const totalPnlPercent = (totalPnl / initialCapital) * 100;

  const avgWin = winningTrades.length > 0 ? winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length : 0;
  const avgLoss =
    losingTrades.length > 0 ? Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length) : 0;

  const grossProfit = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
  const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / grossLoss;

  // Max drawdown
  let peak = initialCapital;
  let maxDrawdown = 0;
  let maxDrawdownPercent = 0;
  for (const point of equityCurve) {
    if (point.equity > peak) peak = point.equity;
    const drawdown = peak - point.equity;
    const drawdownPercent = (drawdown / peak) * 100;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      maxDrawdownPercent = drawdownPercent;
    }
  }

  // Sharpe ratio
  const returns = equityCurve.slice(1).map((p, i) => (p.equity - equityCurve[i].equity) / equityCurve[i].equity);
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const stdDev =
    returns.length > 0
      ? Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length)
      : 0;
  const sharpeRatio = stdDev === 0 ? 0 : (avgReturn / stdDev) * Math.sqrt(252);

  // Buy and hold
  const firstPrice = data[0]?.close || 0;
  const lastPrice = data[data.length - 1]?.close || 0;
  const buyAndHoldPnlPercent = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
  const buyAndHoldPnl = initialCapital * (buyAndHoldPnlPercent / 100);

  return {
    params,
    label: createParamLabel(params),
    totalPnl,
    totalPnlPercent,
    winRate: trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0,
    totalTrades: trades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    averageWin: avgWin,
    averageLoss: avgLoss,
    profitFactor,
    maxDrawdown,
    maxDrawdownPercent,
    sharpeRatio,
    buyAndHoldPnl,
    buyAndHoldPnlPercent,
    equityCurve,
    trades: trades.map((t) => ({ ...t, side: t.side.toString() })),
  };
}

// Generate array of values from min to max with step
function generateRangeValues(min: number, max: number, step: number): number[] {
  const values: number[] = [];
  for (let v = min; v <= max; v += step) {
    values.push(v);
  }
  return values;
}

// Generate all parameter combinations from variations config
function generateCombinations(
  variations: ParameterVariationConfig[]
): Record<string, number | boolean | string>[] {
  if (variations.length === 0) {
    return [{}];
  }

  let combinations: Record<string, number | boolean | string>[] = [{}];

  for (const variation of variations) {
    const values = generateRangeValues(variation.min, variation.max, variation.step);
    if (values.length === 0) continue;

    const newCombinations: Record<string, number | boolean | string>[] = [];
    for (const combo of combinations) {
      for (const value of values) {
        newCombinations.push({ ...combo, [variation.key]: value });
      }
    }
    combinations = newCombinations;
  }

  return combinations.slice(0, MAX_BATCH_RUNS);
}

export default function AlgoBacktestPage() {
  const [rawData, setRawData] = useState<PricePoint[]>([]);
  const [indicatorData, setIndicatorData] = useState<IndicatorData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunningBatch, setIsRunningBatch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableDatasets, setAvailableDatasets] = useState<DatasetInfo[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [visibleCandles, setVisibleCandles] = useState<number>(DEFAULT_VISIBLE_CANDLES);
  const [showEquityCurve, setShowEquityCurve] = useState(true);

  // Strategy state
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>("ema-crossover");
  const [currentParams, setCurrentParams] = useState<Record<string, number | boolean | string>>({});
  const [paramVariations, setParamVariations] = useState<ParameterVariationConfig[]>([]);

  // Results state (multiple results for batch mode)
  const [results, setResults] = useState<ParameterizedResult[]>([]);
  const [activeResultTab, setActiveResultTab] = useState<number>(0);
  
  // Selected trade for chart highlighting
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);

  // Lambda export modal state
  const [showLambdaExport, setShowLambdaExport] = useState(false);

  // Initialize params when strategy changes
  useEffect(() => {
    const defaults = getDefaultParams(selectedStrategyId);
    setCurrentParams(defaults);

    // Initialize variation configs with min/max/step from parameter definitions
    const strategy = AVAILABLE_STRATEGIES[selectedStrategyId];
    if (strategy?.parameters) {
      setParamVariations(
        strategy.parameters
          .filter((p) => p.type === 'number')
          .map((p) => ({
            key: p.key,
            min: p.min ?? Number(p.default),
            max: p.max ?? Number(p.default),
            step: p.step ?? 1,
          }))
      );
    } else {
      setParamVariations([]);
    }
  }, [selectedStrategyId]);

  // Fetch available datasets on mount
  useEffect(() => {
    async function fetchDatasets() {
      try {
        const response = await fetch("/api/data-files");
        const result = await response.json();
        if (result.success && result.files.length > 0) {
          setAvailableDatasets(result.files);
          const dailyFile = result.files.find((f: DatasetInfo) => f.timeframe === "1d");
          setSelectedFiles([dailyFile?.file || result.files[0].file]);
        }
      } catch (err) {
        console.error("Error fetching datasets:", err);
      }
    }
    fetchDatasets();
  }, []);

  // Load raw data when file changes (load first selected file for preview)
  useEffect(() => {
    if (selectedFiles.length === 0) return;
    const selectedFile = selectedFiles[0];

    async function loadData() {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(`/api/spy-data?file=${encodeURIComponent(selectedFile)}`);
        const result = await response.json();

        if (!result.success || !result.data || result.data.length === 0) {
          throw new Error(result.error || "No data received from API");
        }

        console.log("Loaded", result.data.length, "candles from", selectedFile);
        setRawData(result.data);
      } catch (err) {
        console.error("Error loading data:", err);
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [selectedFiles]);

  // Run single backtest
  const runSingleBacktest = useCallback(() => {
    if (rawData.length === 0) return;

    const strategy = AVAILABLE_STRATEGIES[selectedStrategyId];
    if (!strategy) return;

    // Determine required indicator periods from current params
    const requiredEMAs = new Set<number>([9, 21]); // Always include defaults
    const requiredSMAs = new Set<number>([20, 50, 200]); // Always include defaults
    const requiredMACDs: MACDConfig[] = [];

    // Add periods from params
    for (const [key, value] of Object.entries(currentParams)) {
      if (typeof value === "number") {
        if (key.includes("ema") || key.includes("fast") || key.includes("slow")) {
          // Assume EMA periods for crossover strategies
          if (selectedStrategyId.includes("ema")) {
            requiredEMAs.add(value);
          } else if (selectedStrategyId.includes("sma")) {
            requiredSMAs.add(value);
          }
        }
        // Add based on param key naming
        if (key === "fastPeriod" || key === "slowPeriod") {
          if (selectedStrategyId.includes("ema")) {
            requiredEMAs.add(value);
          } else if (!selectedStrategyId.includes("macd")) {
            requiredSMAs.add(value);
          }
        }
      }
    }

    // Add MACD configuration if MACD strategy is selected
    if (selectedStrategyId.includes("macd")) {
      const fastPeriod = (currentParams.fastPeriod as number) || 12;
      const slowPeriod = (currentParams.slowPeriod as number) || 26;
      const signalPeriod = (currentParams.signalPeriod as number) || 9;
      requiredMACDs.push({ fastPeriod, slowPeriod, signalPeriod });
    }
    // Always include default MACD for backward compatibility
    if (!requiredMACDs.some(m => m.fastPeriod === 12 && m.slowPeriod === 26 && m.signalPeriod === 9)) {
      requiredMACDs.push({ fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 });
    }

    const dataWithIndicators = calculateIndicatorsWithParams(
      rawData,
      Array.from(requiredEMAs),
      Array.from(requiredSMAs),
      requiredMACDs
    );
    setIndicatorData(dataWithIndicators);

    const result = runBacktestWithParams(dataWithIndicators, strategy, currentParams, INITIAL_CAPITAL);
    setResults([result]);
    setActiveResultTab(0);
  }, [rawData, selectedStrategyId, currentParams]);

  // Run batch backtest with parameter variations against all selected datasets
  const runBatchBacktest = useCallback(async () => {
    if (selectedFiles.length === 0) return;

    const strategy = AVAILABLE_STRATEGIES[selectedStrategyId];
    if (!strategy) return;

    setIsRunningBatch(true);
    setError(null);

    const combinations = generateCombinations(paramVariations);
    console.log(`Running ${combinations.length} parameter combinations across ${selectedFiles.length} datasets`);

    // Determine all required indicator periods
    const requiredEMAs = new Set<number>([9, 21]);
    const requiredSMAs = new Set<number>([20, 50, 200]);
    const requiredMACDsSet = new Set<string>();

    for (const combo of combinations) {
      for (const [key, value] of Object.entries(combo)) {
        if (typeof value === "number") {
          if (key === "fastPeriod" || key === "slowPeriod") {
            if (selectedStrategyId.includes("ema")) {
              requiredEMAs.add(value);
            } else if (!selectedStrategyId.includes("macd")) {
              requiredSMAs.add(value);
            }
          }
        }
      }

      // Collect MACD configurations for MACD strategy
      if (selectedStrategyId.includes("macd")) {
        const fastPeriod = (combo.fastPeriod as number) || 12;
        const slowPeriod = (combo.slowPeriod as number) || 26;
        const signalPeriod = (combo.signalPeriod as number) || 9;
        requiredMACDsSet.add(`${fastPeriod}_${slowPeriod}_${signalPeriod}`);
      }
    }

    // Convert MACD set to array of configs
    const requiredMACDs: MACDConfig[] = Array.from(requiredMACDsSet).map(key => {
      const [fast, slow, signal] = key.split("_").map(Number);
      return { fastPeriod: fast, slowPeriod: slow, signalPeriod: signal };
    });
    // Always include default MACD for backward compatibility
    if (!requiredMACDs.some(m => m.fastPeriod === 12 && m.slowPeriod === 26 && m.signalPeriod === 9)) {
      requiredMACDs.push({ fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 });
    }

    const failedDatasets: string[] = [];

    // Process all datasets in parallel
    const datasetResults = await Promise.all(
      selectedFiles.map(async (datasetFile) => {
        const datasetInfo = availableDatasets.find(ds => ds.file === datasetFile);
        const datasetLabel = datasetInfo?.label || datasetFile;

        try {
          // Load dataset
          const response = await fetch(`/api/spy-data?file=${encodeURIComponent(datasetFile)}`);
          const result = await response.json();

          if (!result.success || !result.data || result.data.length === 0) {
            const errorMsg = result.error || "No data received";
            console.error(`Failed to load dataset ${datasetFile}: ${errorMsg}`);
            failedDatasets.push(`${datasetLabel}: ${errorMsg}`);
            return { datasetFile, datasetLabel, data: null };
          }

          return { datasetFile, datasetLabel, data: result.data };
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "Unknown error";
          console.error(`Error processing dataset ${datasetFile}: ${errorMsg}`);
          failedDatasets.push(`${datasetLabel}: ${errorMsg}`);
          return { datasetFile, datasetLabel, data: null };
        }
      })
    );

    const batchResults: ParameterizedResult[] = [];
    let firstDatasetWithData = true;

    // Process results and run backtests
    for (const { datasetFile, datasetLabel, data } of datasetResults) {
      if (!data) continue;

      const dataWithIndicators = calculateIndicatorsWithParams(
        data,
        Array.from(requiredEMAs),
        Array.from(requiredSMAs),
        requiredMACDs
      );

      // Update indicator data for first successful dataset (for chart display)
      if (firstDatasetWithData) {
        setIndicatorData(dataWithIndicators);
        firstDatasetWithData = false;
      }

      // Run all backtests for this dataset
      for (const params of combinations) {
        const backtestResult = runBacktestWithParams(dataWithIndicators, strategy, params, INITIAL_CAPITAL);
        batchResults.push({
          ...backtestResult,
          dataset: datasetFile,
          datasetLabel,
        });
      }
    }

    // Sort by total P&L descending
    batchResults.sort((a, b) => b.totalPnlPercent - a.totalPnlPercent);

    // Show error if some datasets failed
    if (failedDatasets.length > 0) {
      setError(`Failed to load ${failedDatasets.length} dataset(s): ${failedDatasets.join("; ")}`);
    }

    setResults(batchResults);
    setActiveResultTab(0);
    setIsRunningBatch(false);
  }, [selectedFiles, selectedStrategyId, paramVariations, availableDatasets]);

  // Auto-run single backtest when data or params change
  useEffect(() => {
    if (rawData.length > 0 && Object.keys(currentParams).length > 0) {
      runSingleBacktest();
    }
  }, [rawData, currentParams, runSingleBacktest]);

  const activeResult = results[activeResultTab];
  const strategy = AVAILABLE_STRATEGIES[selectedStrategyId];

  if (isLoading) {
    return (
      <div className='flex flex-col h-screen bg-slate-900'>
        <div className='flex-1 flex items-center justify-center text-white'>
          <div className='flex items-center gap-3'>
            <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400'></div>
            <span>Loading data...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='flex flex-col h-screen bg-slate-900'>
        <div className='flex-1 flex items-center justify-center text-red-400 p-8'>
          <div className='text-center'>
            <div className='text-xl mb-2'>Error</div>
            <div>{error}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='flex flex-col h-screen bg-slate-900 text-white overflow-hidden'>
      <div className='flex-1 flex overflow-hidden'>
        {/* Left Panel - Strategy & Parameters */}
        <div className='w-[450px] flex-shrink-0 border-r border-slate-700 flex flex-col overflow-hidden'>
          {/* Dataset Selector - Multi-select */}
          <div className='p-4 border-b border-slate-700'>
            <div className='flex items-center justify-between mb-2'>
              <label className='text-sm text-slate-400'>Datasets</label>
              <span className='text-xs text-slate-500'>
                {selectedFiles.length} selected
              </span>
            </div>
            <div className='max-h-48 overflow-y-auto bg-slate-800 border border-slate-600 rounded p-2 space-y-1'>
              {availableDatasets.map((ds) => (
                <label
                  key={ds.file}
                  className='flex items-center gap-2 px-2 py-1 hover:bg-slate-700 rounded cursor-pointer'
                >
                  <input
                    type='checkbox'
                    checked={selectedFiles.includes(ds.file)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedFiles((prev) => [...prev, ds.file]);
                      } else {
                        setSelectedFiles((prev) => prev.filter((f) => f !== ds.file));
                      }
                    }}
                    className='rounded border-slate-500 bg-slate-700 text-blue-500'
                  />
                  <span className='text-sm text-white'>{ds.label}</span>
                </label>
              ))}
            </div>
            {selectedFiles.length === 0 && (
              <p className='text-xs text-amber-400 mt-1'>Select at least one dataset</p>
            )}
          </div>

          {/* Strategy Selector */}
          <div className='p-4 border-b border-slate-700'>
            <div className='flex items-center justify-between mb-2'>
              <label className='text-sm text-slate-400'>Strategy</label>
              <button
                onClick={() => setShowLambdaExport(true)}
                className='flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded transition-colors'
                title='Export as AWS Lambda with Tradier API'
              >
                <svg className='w-3.5 h-3.5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                  <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12' />
                </svg>
                Export Lambda
              </button>
            </div>
            <select
              value={selectedStrategyId}
              onChange={(e) => setSelectedStrategyId(e.target.value)}
              className='w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white'
            >
              {Object.values(AVAILABLE_STRATEGIES).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <p className='text-xs text-slate-500 mt-1'>{strategy?.description}</p>
          </div>

          {/* Parameter Configuration */}
          {strategy?.parameters && strategy.parameters.length > 0 && (
            <div className='p-4 border-b border-slate-700 overflow-y-auto flex-shrink-0'>
              <div className='flex items-center justify-between mb-3'>
                <label className='text-sm text-slate-400'>Parameters</label>
                <span className='text-xs text-slate-500'>
                  {`${generateCombinations(paramVariations).length} combinations × ${selectedFiles.length} datasets`}
                </span>
              </div>

              {strategy.parameters
                .filter((param) => param.type === 'number')
                .map((param) => {
                  const variation = paramVariations.find((v) => v.key === param.key);

                  return (
                    <div key={param.key} className='mb-4 bg-slate-800 rounded p-3'>
                      <div className='mb-2'>
                        <span className='text-sm text-white font-medium'>{param.name}</span>
                        <p className='text-xs text-slate-500'>{param.description}</p>
                      </div>

                      <div className='grid grid-cols-2 gap-2'>
                        <div>
                          <label className='block text-xs text-slate-400 mb-1'>Min</label>
                          <input
                            type='number'
                            value={variation?.min ?? param.min ?? Number(param.default)}
                            min={param.min}
                            max={param.max}
                            step={param.step}
                            onChange={(e) => {
                              const parsed = parseFloat(e.target.value);
                              const newMin = isNaN(parsed) ? Number(param.min ?? param.default) : parsed;
                              setParamVariations((prev) =>
                                prev.map((v) => (v.key === param.key ? { ...v, min: newMin } : v))
                              );
                            }}
                            className='w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-white'
                          />
                        </div>
                        <div>
                          <label className='block text-xs text-slate-400 mb-1'>Max</label>
                          <input
                            type='number'
                            value={variation?.max ?? param.max ?? Number(param.default)}
                            min={param.min}
                            max={param.max}
                            step={param.step}
                            onChange={(e) => {
                              const parsed = parseFloat(e.target.value);
                              const newMax = isNaN(parsed) ? Number(param.max ?? param.default) : parsed;
                              setParamVariations((prev) =>
                                prev.map((v) => (v.key === param.key ? { ...v, max: newMax } : v))
                              );
                            }}
                            className='w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-white'
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}

              {/* Run Batch Button */}
              <button
                onClick={runBatchBacktest}
                disabled={isRunningBatch || selectedFiles.length === 0}
                className='w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded transition-colors'
              >
                {isRunningBatch
                  ? "Running..."
                  : `Run ${generateCombinations(paramVariations).length * selectedFiles.length} Variations`}
              </button>
            </div>
          )}

          {/* Results Summary (when multiple results) */}
          {results.length > 1 && (
            <div className='flex-1 overflow-y-auto p-4'>
              <div className='text-sm text-slate-400 mb-2'>Results Comparison ({results.length} runs)</div>
              <div className='space-y-2'>
                {results.map((result, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveResultTab(idx)}
                    className={`w-full text-left p-3 rounded text-sm transition-colors ${
                      activeResultTab === idx
                        ? "bg-blue-600/20 border border-blue-500"
                        : "bg-slate-800 hover:bg-slate-750 border border-transparent"
                    }`}
                  >
                    {result.datasetLabel && (
                      <div className='text-xs text-blue-400 mb-1 truncate'>{result.datasetLabel}</div>
                    )}
                    <div className='flex items-center justify-between'>
                      <span className='font-mono text-xs text-slate-400 truncate max-w-[200px]'>{result.label}</span>
                      <span
                        className={`font-bold ${result.totalPnlPercent >= 0 ? "text-green-400" : "text-red-400"}`}
                      >
                        {result.totalPnlPercent >= 0 ? "+" : ""}
                        {result.totalPnlPercent.toFixed(2)}%
                      </span>
                    </div>
                    <div className='flex items-center justify-between mt-1 text-xs text-slate-500'>
                      <span>
                        {result.totalTrades} trades • {result.winRate.toFixed(0)}% win
                      </span>
                      <span>Sharpe: {result.sharpeRatio.toFixed(2)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Strategy Info (when single result) */}
          {results.length <= 1 && (
            <div className='flex-1 flex flex-col overflow-hidden p-4'>
              <div className='bg-slate-800 rounded p-4 mb-3'>
                <h3 className='text-sm font-semibold text-slate-300 mb-2'>{strategy?.name}</h3>
                <p className='text-xs text-slate-400 mb-3'>{strategy?.description}</p>
                <div className='text-xs text-slate-500 border-t border-slate-700 pt-3'>
                  <p className='mb-1'>✓ Type-safe strategy handler</p>
                  <p className='mb-1'>✓ Configurable parameters</p>
                  <p>✓ Batch optimization support</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Chart and Stats */}
        <div className='flex-1 flex flex-col overflow-hidden'>
          {/* Tabs for Multiple Results */}
          {results.length > 1 && (
            <div className='flex border-b border-slate-700 bg-slate-800 overflow-x-auto'>
              {results.slice(0, 10).map((result, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveResultTab(idx)}
                  className={`px-4 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                    activeResultTab === idx
                      ? "border-blue-500 text-blue-400 bg-slate-900"
                      : "border-transparent text-slate-400 hover:text-white hover:bg-slate-750"
                  }`}
                >
                  #{idx + 1}{" "}
                  <span className={result.totalPnlPercent >= 0 ? "text-green-400" : "text-red-400"}>
                    {result.totalPnlPercent >= 0 ? "+" : ""}
                    {result.totalPnlPercent.toFixed(1)}%
                  </span>
                </button>
              ))}
              {results.length > 10 && (
                <span className='px-4 py-2 text-xs text-slate-500'>+{results.length - 10} more</span>
              )}
            </div>
          )}

          {/* Active Result Label */}
          {activeResult && results.length > 1 && (
            <div className='px-4 py-2 bg-slate-850 border-b border-slate-700 text-xs'>
              {activeResult.datasetLabel && (
                <>
                  <span className='text-slate-400'>Dataset: </span>
                  <span className='text-blue-400 mr-3'>{activeResult.datasetLabel}</span>
                </>
              )}
              <span className='text-slate-400'>Parameters: </span>
              <span className='font-mono text-blue-400'>{activeResult.label}</span>
            </div>
          )}

          {/* Stats Panel */}
          {activeResult && (
            <div className='p-4 border-b border-slate-700 bg-slate-800'>
              <div className='grid grid-cols-6 gap-4 text-sm'>
                <div className='bg-slate-900 rounded p-3'>
                  <div className='text-slate-400 text-xs mb-1'>Strategy P&L</div>
                  <div
                    className={`text-lg font-bold ${activeResult.totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}
                  >
                    {activeResult.totalPnl >= 0 ? "+" : ""}${activeResult.totalPnl.toFixed(2)}
                    <span className='text-sm ml-1'>({activeResult.totalPnlPercent.toFixed(2)}%)</span>
                  </div>
                </div>
                <div className='bg-slate-900 rounded p-3'>
                  <div className='text-slate-400 text-xs mb-1'>Buy & Hold</div>
                  <div
                    className={`text-lg font-bold ${activeResult.buyAndHoldPnl >= 0 ? "text-green-400" : "text-red-400"}`}
                  >
                    {activeResult.buyAndHoldPnl >= 0 ? "+" : ""}${activeResult.buyAndHoldPnl.toFixed(2)}
                    <span className='text-sm ml-1'>({activeResult.buyAndHoldPnlPercent.toFixed(2)}%)</span>
                  </div>
                </div>
                <div className='bg-slate-900 rounded p-3'>
                  <div className='text-slate-400 text-xs mb-1'>Win Rate</div>
                  <div className='text-lg font-bold text-white'>
                    {activeResult.winRate.toFixed(1)}%
                    <span className='text-sm text-slate-400 ml-1'>
                      ({activeResult.winningTrades}W / {activeResult.losingTrades}L)
                    </span>
                  </div>
                </div>
                <div className='bg-slate-900 rounded p-3'>
                  <div className='text-slate-400 text-xs mb-1'>Profit Factor</div>
                  <div
                    className={`text-lg font-bold ${activeResult.profitFactor >= 1 ? "text-green-400" : "text-red-400"}`}
                  >
                    {activeResult.profitFactor === Infinity ? "∞" : activeResult.profitFactor.toFixed(2)}
                  </div>
                </div>
                <div className='bg-slate-900 rounded p-3'>
                  <div className='text-slate-400 text-xs mb-1'>Max Drawdown</div>
                  <div className='text-lg font-bold text-red-400'>
                    -${activeResult.maxDrawdown.toFixed(2)}
                    <span className='text-sm ml-1'>({activeResult.maxDrawdownPercent.toFixed(2)}%)</span>
                  </div>
                </div>
                <div className='bg-slate-900 rounded p-3'>
                  <div className='text-slate-400 text-xs mb-1'>Sharpe Ratio</div>
                  <div
                    className={`text-lg font-bold ${activeResult.sharpeRatio >= 1 ? "text-green-400" : activeResult.sharpeRatio >= 0 ? "text-yellow-400" : "text-red-400"}`}
                  >
                    {activeResult.sharpeRatio.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Secondary stats */}
              <div className='grid grid-cols-6 gap-4 text-sm mt-2'>
                <div className='text-center'>
                  <span className='text-slate-400 text-xs'>Trades:</span>
                  <span className='ml-1 text-white'>{activeResult.totalTrades}</span>
                </div>
                <div className='text-center'>
                  <span className='text-slate-400 text-xs'>Avg Win:</span>
                  <span className='ml-1 text-green-400'>${activeResult.averageWin.toFixed(2)}</span>
                </div>
                <div className='text-center'>
                  <span className='text-slate-400 text-xs'>Avg Loss:</span>
                  <span className='ml-1 text-red-400'>-${activeResult.averageLoss.toFixed(2)}</span>
                </div>
                <div className='text-center col-span-2'>
                  <span className='text-slate-400 text-xs'>Alpha vs B&H:</span>
                  <span
                    className={`ml-1 font-bold ${activeResult.totalPnlPercent - activeResult.buyAndHoldPnlPercent >= 0 ? "text-green-400" : "text-red-400"}`}
                  >
                    {activeResult.totalPnlPercent - activeResult.buyAndHoldPnlPercent >= 0 ? "+" : ""}
                    {(activeResult.totalPnlPercent - activeResult.buyAndHoldPnlPercent).toFixed(2)}%
                  </span>
                </div>
                <div className='text-center'>
                  <label className='text-slate-400 text-xs cursor-pointer'>
                    <input
                      type='checkbox'
                      checked={showEquityCurve}
                      onChange={(e) => setShowEquityCurve(e.target.checked)}
                      className='mr-1'
                    />
                    Equity Curve
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Charts Container */}
          <div className='flex-1 flex flex-col overflow-hidden'>
            {/* Price Chart */}
            <div className={showEquityCurve ? 'flex-1 min-h-0' : 'flex-1 overflow-hidden'}>
              <BacktestChart
                data={indicatorData}
                trades={
                  activeResult?.trades.map((t) => ({
                    ...t,
                    side: t.side === "LONG" ? PositionSide.LONG : PositionSide.SHORT,
                  })) || []
                }
                visibleCandles={visibleCandles}
                onVisibleCandlesChange={setVisibleCandles}
                selectedStrategyId={selectedStrategyId}
                selectedTradeId={selectedTradeId}
              />
            </div>
            
            {/* Equity Curve Chart (Separate) */}
            {showEquityCurve && activeResult && (
              <div className='h-40 border-t border-slate-700'>
                <EquityCurveChart
                  equityCurve={activeResult.equityCurve}
                  initialCapital={INITIAL_CAPITAL}
                />
              </div>
            )}
          </div>

          {/* Trade Log */}
          {activeResult && activeResult.trades.length > 0 && (
            <div className='h-48 border-t border-slate-700 overflow-hidden flex flex-col'>
              <div className='px-4 py-2 bg-slate-800 text-sm font-semibold border-b border-slate-700'>
                Trade Log ({activeResult.trades.length} trades)
              </div>
              <div className='flex-1 overflow-y-auto'>
                <table className='w-full text-xs'>
                  <thead className='bg-slate-800 sticky top-0'>
                    <tr className='text-slate-400'>
                      <th className='px-3 py-2 text-left'>Side</th>
                      <th className='px-3 py-2 text-left'>Entry Time</th>
                      <th className='px-3 py-2 text-right'>Entry Price</th>
                      <th className='px-3 py-2 text-left'>Exit Time</th>
                      <th className='px-3 py-2 text-right'>Exit Price</th>
                      <th className='px-3 py-2 text-right'>P&L</th>
                      <th className='px-3 py-2 text-right'>P&L %</th>
                      <th className='px-3 py-2 text-left'>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeResult.trades.map((trade) => (
                      <tr 
                        key={trade.id} 
                        className={`border-b border-slate-800 hover:bg-slate-800/50 cursor-pointer transition-colors ${selectedTradeId === trade.id ? 'bg-blue-900/40 ring-1 ring-blue-500' : ''}`}
                        onClick={() => setSelectedTradeId(selectedTradeId === trade.id ? null : trade.id)}
                      >
                        <td
                          className={`px-3 py-2 font-semibold ${trade.side === "LONG" ? "text-green-400" : "text-red-400"}`}
                        >
                          {trade.side}
                        </td>
                        <td className='px-3 py-2 text-slate-300'>{new Date(trade.entryTime).toLocaleString()}</td>
                        <td className='px-3 py-2 text-right text-slate-300'>${trade.entryPrice.toFixed(2)}</td>
                        <td className='px-3 py-2 text-slate-300'>{new Date(trade.exitTime).toLocaleString()}</td>
                        <td className='px-3 py-2 text-right text-slate-300'>${trade.exitPrice.toFixed(2)}</td>
                        <td
                          className={`px-3 py-2 text-right font-mono ${trade.pnl >= 0 ? "text-green-400" : "text-red-400"}`}
                        >
                          {trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)}
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-mono ${trade.pnlPercent >= 0 ? "text-green-400" : "text-red-400"}`}
                        >
                          {trade.pnlPercent >= 0 ? "+" : ""}
                          {trade.pnlPercent.toFixed(2)}%
                        </td>
                        <td className='px-3 py-2 text-slate-400 truncate max-w-[200px]' title={trade.reason}>
                          {trade.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lambda Export Modal */}
      <LambdaExportModal
        isOpen={showLambdaExport}
        onClose={() => setShowLambdaExport(false)}
        strategyId={selectedStrategyId}
        strategyName={strategy?.name || selectedStrategyId}
        params={currentParams}
      />
    </div>
  );
}
