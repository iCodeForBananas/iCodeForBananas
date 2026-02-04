"use client";

import React, { useState, useEffect, useCallback } from "react";
import BacktestChart from "../components/BacktestChart";
import { PricePoint, IndicatorData, BacktestResult, BacktestTrade, PositionSide } from "@/app/types";

const DEFAULT_VISIBLE_CANDLES = 300;
const INITIAL_CAPITAL = 100000;

interface DatasetInfo {
  file: string;
  symbol: string;
  timeframe: string;
  date: string;
  label: string;
}

// Example strategy templates
const STRATEGY_TEMPLATES = {
  emaCrossover: {
    name: "EMA Crossover",
    description: "Buy when EMA 9 crosses above EMA 21, sell when it crosses below",
    code: `// EMA Crossover Strategy
// Available data: current (IndicatorData), previous (IndicatorData), index (number)
// Return: { action: 'buy' | 'sell' | 'hold', reason: string }

function evaluate(current, previous, index) {
  if (!current.ema9 || !current.ema21 || !previous?.ema9 || !previous?.ema21) {
    return { action: 'hold', reason: 'Waiting for indicators' };
  }

  // EMA 9 crosses above EMA 21 - BUY signal
  if (previous.ema9 <= previous.ema21 && current.ema9 > current.ema21) {
    return { action: 'buy', reason: 'EMA 9 crossed above EMA 21' };
  }

  // EMA 9 crosses below EMA 21 - SELL signal
  if (previous.ema9 >= previous.ema21 && current.ema9 < current.ema21) {
    return { action: 'sell', reason: 'EMA 9 crossed below EMA 21' };
  }

  return { action: 'hold', reason: '' };
}`,
  },
  meanReversion: {
    name: "RSI Mean Reversion",
    description: "Buy when RSI < 30 (oversold), sell when RSI > 70 (overbought)",
    code: `// RSI Mean Reversion Strategy
// Available data: current (IndicatorData), previous (IndicatorData), index (number)
// Return: { action: 'buy' | 'sell' | 'hold', reason: string }

function evaluate(current, previous, index) {
  if (!current.rsi) {
    return { action: 'hold', reason: 'Waiting for RSI' };
  }

  // RSI below 30 - oversold, BUY signal
  if (current.rsi < 30) {
    return { action: 'buy', reason: 'RSI oversold (' + current.rsi.toFixed(1) + ')' };
  }

  // RSI above 70 - overbought, SELL signal
  if (current.rsi > 70) {
    return { action: 'sell', reason: 'RSI overbought (' + current.rsi.toFixed(1) + ')' };
  }

  return { action: 'hold', reason: '' };
}`,
  },
  donchianBreakout: {
    name: "Donchian Breakout",
    description: "20-period high/low breakout with 200 SMA trend filter and ATR stop",
    code: `/**
 * DONCHIAN BREAKOUT STRATEGY (2026 Optimized)
 * Entry: 20-period high/low breakout
 * Exit: 10-period opposite band (Fast Exit)
 * Filter: 200 SMA (Long-term trend)
 */
function evaluate(current, previous, index) {
  // 1. Data Integrity Check
  if (!current.upperBand || !current.lowerBand || !current.sma200 || !current.atr) {
    return { action: 'hold', reason: 'Waiting for indicators' };
  }

  // Define "Exit Window" using the midLine as a proxy for faster exit
  const exitThresholdLong = current.midLine || current.lowerBand; 
  const exitThresholdShort = current.midLine || current.upperBand;

  // --- BUY LOGIC (Trend Following) ---
  // Entry: Price touches or exceeds the 20-period Upper Band
  const isBullishBreakout = current.close >= current.upperBand;
  const isAboveLongTermTrend = current.close > current.sma200;

  if (isBullishBreakout && isAboveLongTermTrend) {
    return { 
      action: 'buy', 
      reason: 'Bullish Breakout: Price hit 20-period high (' + current.upperBand.toFixed(2) + ') above SMA 200.' 
    };
  }

  // --- SELL LOGIC (Risk Management) ---
  // Exit: Price breaks the opposite 10-period band or the Midline
  const isTrendReversal = current.close <= exitThresholdLong;
  
  // ATR-based Emergency Stop: Exit if price drops 2x ATR from previous close
  const emergencyStop = previous && current.close < (previous.close - (current.atr * 2));

  if (isTrendReversal || emergencyStop) {
    let reason = emergencyStop ? 'Emergency ATR Stop triggered' : 'Trend reversal: Price crossed Midline/Lower Band';
    return { action: 'sell', reason: reason };
  }

  return { action: 'hold', reason: '' };
}`,
  },
  breakout: {
    name: "Price Breakout",
    description: "Buy on new highs, sell on new lows (momentum following)",
    code: `// Breakout Strategy
// Available data: current (IndicatorData), previous (IndicatorData), index (number)
// Return: { action: 'buy' | 'sell' | 'hold', reason: string }

function evaluate(current, previous, index) {
  if (!current.upperBand || !current.lowerBand) {
    return { action: 'hold', reason: 'Waiting for Donchian bands' };
  }

  // Price breaks above upper band - BUY
  if (current.close > current.upperBand) {
    return { action: 'buy', reason: 'Breakout above upper band' };
  }

  // Price breaks below lower band - SELL
  if (current.close < current.lowerBand) {
    return { action: 'sell', reason: 'Breakdown below lower band' };
  }

  return { action: 'hold', reason: '' };
}`,
  },
  goldenCross: {
    name: "Golden Cross/Death Cross",
    description: "Buy when SMA 50 crosses above SMA 200, sell on death cross",
    code: `// Golden Cross / Death Cross Strategy
// Available data: current (IndicatorData), previous (IndicatorData), index (number)
// Return: { action: 'buy' | 'sell' | 'hold', reason: string }

function evaluate(current, previous, index) {
  if (!current.sma50 || !current.sma200 || !previous?.sma50 || !previous?.sma200) {
    return { action: 'hold', reason: 'Waiting for SMAs' };
  }

  // Golden Cross: SMA 50 crosses above SMA 200
  if (previous.sma50 <= previous.sma200 && current.sma50 > current.sma200) {
    return { action: 'buy', reason: 'Golden Cross - SMA 50 crossed above SMA 200' };
  }

  // Death Cross: SMA 50 crosses below SMA 200
  if (previous.sma50 >= previous.sma200 && current.sma50 < current.sma200) {
    return { action: 'sell', reason: 'Death Cross - SMA 50 crossed below SMA 200' };
  }

  return { action: 'hold', reason: '' };
}`,
  },
  custom: {
    name: "Custom Strategy",
    description: "Write your own strategy logic",
    code: `// Custom Strategy Template
// Available data: current (IndicatorData), previous (IndicatorData), index (number)
// 
// IndicatorData contains:
//   - time, open, high, low, close (price data)
//   - sma20, sma50, sma200 (Simple Moving Averages)
//   - ema9, ema21 (Exponential Moving Averages)
//   - rsi (Relative Strength Index, 0-100)
//   - macd, macdSignal, macdHistogram
//   - atr (Average True Range)
//   - upperBand, lowerBand, midLine (Donchian Channels)
//   - prevClose, prevHigh, prevLow
//
// Return: { action: 'buy' | 'sell' | 'hold', reason: string }

function evaluate(current, previous, index) {
  // Your strategy logic here
  // Example: Buy when price closes above SMA 20
  
  if (!current.sma20 || !previous?.sma20) {
    return { action: 'hold', reason: 'Waiting for indicators' };
  }

  if (previous.close <= previous.sma20 && current.close > current.sma20) {
    return { action: 'buy', reason: 'Price crossed above SMA 20' };
  }

  if (previous.close >= previous.sma20 && current.close < current.sma20) {
    return { action: 'sell', reason: 'Price crossed below SMA 20' };
  }

  return { action: 'hold', reason: '' };
}`,
  },
};

// Calculate all indicators for the data
function calculateIndicators(data: PricePoint[]): IndicatorData[] {
  const result: IndicatorData[] = [];

  // Helper functions
  const calcSMA = (values: number[], period: number): number | undefined => {
    if (values.length < period) return undefined;
    return values.slice(-period).reduce((a, b) => a + b, 0) / period;
  };

  const calcEMA = (currentPrice: number, prevEMA: number | undefined, period: number): number | undefined => {
    const multiplier = 2 / (period + 1);
    if (prevEMA === undefined) return currentPrice;
    return (currentPrice - prevEMA) * multiplier + prevEMA;
  };

  const closePrices: number[] = [];
  let prevEma9: number | undefined;
  let prevEma21: number | undefined;

  // For RSI
  let avgGain = 0;
  let avgLoss = 0;
  const rsiPeriod = 14;

  // For MACD
  let ema12: number | undefined;
  let ema26: number | undefined;
  let signalEma: number | undefined;

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

    // SMAs
    indicatorData.sma20 = calcSMA(closePrices, 20);
    indicatorData.sma50 = calcSMA(closePrices, 50);
    indicatorData.sma200 = calcSMA(closePrices, 200);

    // EMAs
    if (i === 0) {
      prevEma9 = candle.close;
      prevEma21 = candle.close;
    } else {
      prevEma9 = calcEMA(candle.close, prevEma9, 9);
      prevEma21 = calcEMA(candle.close, prevEma21, 21);
    }
    indicatorData.ema9 = prevEma9;
    indicatorData.ema21 = prevEma21;

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

    // MACD
    if (i === 0) {
      ema12 = candle.close;
      ema26 = candle.close;
    } else {
      ema12 = calcEMA(candle.close, ema12, 12);
      ema26 = calcEMA(candle.close, ema26, 26);
    }
    if (ema12 !== undefined && ema26 !== undefined && i >= 26) {
      indicatorData.macd = ema12 - ema26;
      if (signalEma === undefined) {
        signalEma = indicatorData.macd;
      } else {
        signalEma = calcEMA(indicatorData.macd, signalEma, 9);
      }
      indicatorData.macdSignal = signalEma;
      if (indicatorData.macdSignal !== undefined) {
        indicatorData.macdHistogram = indicatorData.macd - indicatorData.macdSignal;
      }
    }

    // ATR
    if (i > 0) {
      const tr = Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - data[i - 1].close),
        Math.abs(candle.low - data[i - 1].close),
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

// Run backtest with given strategy
function runBacktest(data: IndicatorData[], strategyCode: string, initialCapital: number): BacktestResult {
  const trades: BacktestTrade[] = [];
  const equityCurve: { time: number; equity: number }[] = [];
  let equity = initialCapital;
  let position: { side: PositionSide; entryPrice: number; entryTime: number; entryIdx: number } | null = null;
  let tradeId = 1;

  // Create the evaluate function from strategy code
  let evaluateFn: (
    current: IndicatorData,
    previous: IndicatorData | null,
    index: number,
  ) => { action: string; reason: string };

  try {
    // Extract the function body and create it
    const fnMatch = strategyCode.match(/function\s+evaluate\s*\([^)]*\)\s*\{([\s\S]*)\}/);
    if (fnMatch) {
      evaluateFn = new Function("current", "previous", "index", fnMatch[1]) as typeof evaluateFn;
    } else {
      throw new Error("Could not parse strategy function");
    }
  } catch (error) {
    console.error("Strategy parsing error:", error);
    return {
      trades: [],
      totalPnl: 0,
      totalPnlPercent: 0,
      winRate: 0,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      averageWin: 0,
      averageLoss: 0,
      profitFactor: 0,
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      sharpeRatio: 0,
      buyAndHoldPnl: 0,
      buyAndHoldPnlPercent: 0,
      equityCurve: [],
    };
  }

  // Run through the data
  for (let i = 1; i < data.length; i++) {
    const current = data[i];
    const previous = data[i - 1];

    try {
      const signal = evaluateFn(current, previous, i);

      if (signal.action === "buy" && !position) {
        // Open long position
        position = {
          side: PositionSide.LONG,
          entryPrice: current.close,
          entryTime: current.time,
          entryIdx: i,
        };
      } else if (signal.action === "sell" && position) {
        // Close position
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
    } catch (error) {
      console.error("Strategy execution error at index", i, error);
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

  // Sharpe ratio (simplified - annualized)
  const returns = equityCurve.slice(1).map((p, i) => (p.equity - equityCurve[i].equity) / equityCurve[i].equity);
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const stdDev =
    returns.length > 0
      ? Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length)
      : 0;
  const sharpeRatio = stdDev === 0 ? 0 : (avgReturn / stdDev) * Math.sqrt(252);

  // Buy and hold comparison
  const firstPrice = data[0]?.close || 0;
  const lastPrice = data[data.length - 1]?.close || 0;
  const buyAndHoldPnlPercent = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
  const buyAndHoldPnl = initialCapital * (buyAndHoldPnlPercent / 100);

  return {
    trades,
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
  };
}

export default function AlgoBacktestPage() {
  const [indicatorData, setIndicatorData] = useState<IndicatorData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableDatasets, setAvailableDatasets] = useState<DatasetInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [visibleCandles, setVisibleCandles] = useState<number>(DEFAULT_VISIBLE_CANDLES);
  const [showEquityCurve, setShowEquityCurve] = useState(true);

  // Strategy state
  const [selectedTemplate, setSelectedTemplate] = useState<string>("emaCrossover");
  const [strategyCode, setStrategyCode] = useState(STRATEGY_TEMPLATES.emaCrossover.code);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // Fetch available datasets on mount
  useEffect(() => {
    async function fetchDatasets() {
      try {
        const response = await fetch("/api/data-files");
        const result = await response.json();
        if (result.success && result.files.length > 0) {
          setAvailableDatasets(result.files);
          // Prefer 1d timeframe for backtesting
          const dailyFile = result.files.find((f: DatasetInfo) => f.timeframe === "1d");
          setSelectedFile(dailyFile?.file || result.files[0].file);
        }
      } catch (err) {
        console.error("Error fetching datasets:", err);
      }
    }
    fetchDatasets();
  }, []);

  // Load data when selected file changes
  useEffect(() => {
    if (!selectedFile) return;

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

        // Calculate indicators
        const withIndicators = calculateIndicators(result.data);
        setIndicatorData(withIndicators);

        // Auto-run backtest with current strategy
        const backtest = runBacktest(withIndicators, strategyCode, INITIAL_CAPITAL);
        setBacktestResult(backtest);
      } catch (err) {
        console.error("Error loading data:", err);
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFile]);

  // Handle template selection
  const handleTemplateChange = (templateKey: string) => {
    setSelectedTemplate(templateKey);
    const template = STRATEGY_TEMPLATES[templateKey as keyof typeof STRATEGY_TEMPLATES];
    if (template) {
      setStrategyCode(template.code);
    }
  };

  // Run backtest
  const handleRunBacktest = useCallback(() => {
    if (indicatorData.length === 0) return;

    setIsRunning(true);
    try {
      const result = runBacktest(indicatorData, strategyCode, INITIAL_CAPITAL);
      setBacktestResult(result);
    } catch (err) {
      console.error("Backtest error:", err);
      setError(err instanceof Error ? err.message : "Backtest failed");
    } finally {
      setIsRunning(false);
    }
  }, [indicatorData, strategyCode]);

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
        {/* Left Panel - Strategy Editor */}
        <div className='w-[450px] flex-shrink-0 border-r border-slate-700 flex flex-col overflow-hidden'>
          {/* Dataset Selector */}
          <div className='p-4 border-b border-slate-700'>
            <label className='block text-sm text-slate-400 mb-2'>Dataset</label>
            <select
              value={selectedFile}
              onChange={(e) => setSelectedFile(e.target.value)}
              className='w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white'
            >
              {availableDatasets.map((ds) => (
                <option key={ds.file} value={ds.file}>
                  {ds.label}
                </option>
              ))}
            </select>
          </div>

          {/* Strategy Template Selector */}
          <div className='p-4 border-b border-slate-700'>
            <label className='block text-sm text-slate-400 mb-2'>Strategy Template</label>
            <select
              value={selectedTemplate}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className='w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white'
            >
              {Object.entries(STRATEGY_TEMPLATES).map(([key, template]) => (
                <option key={key} value={key}>
                  {template.name}
                </option>
              ))}
            </select>
            <p className='text-xs text-slate-500 mt-1'>
              {STRATEGY_TEMPLATES[selectedTemplate as keyof typeof STRATEGY_TEMPLATES]?.description}
            </p>
          </div>

          {/* Code Editor */}
          <div className='flex-1 flex flex-col overflow-hidden p-4'>
            <label className='block text-sm text-slate-400 mb-2'>Strategy Code</label>
            <textarea
              value={strategyCode}
              onChange={(e) => setStrategyCode(e.target.value)}
              className='flex-1 bg-slate-950 border border-slate-600 rounded p-3 text-sm font-mono text-green-400 resize-none focus:outline-none focus:border-blue-500'
              spellCheck={false}
            />
            <button
              onClick={handleRunBacktest}
              disabled={isRunning || indicatorData.length === 0}
              className='mt-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded transition-colors'
            >
              {isRunning ? "Running..." : "▶ Run Backtest"}
            </button>
          </div>
        </div>

        {/* Right Panel - Chart and Stats */}
        <div className='flex-1 flex flex-col overflow-hidden'>
          {/* Stats Panel */}
          {backtestResult && (
            <div className='p-4 border-b border-slate-700 bg-slate-800'>
              <div className='grid grid-cols-6 gap-4 text-sm'>
                <div className='bg-slate-900 rounded p-3'>
                  <div className='text-slate-400 text-xs mb-1'>Strategy P&L</div>
                  <div
                    className={`text-lg font-bold ${backtestResult.totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}
                  >
                    {backtestResult.totalPnl >= 0 ? "+" : ""}${backtestResult.totalPnl.toFixed(2)}
                    <span className='text-sm ml-1'>({backtestResult.totalPnlPercent.toFixed(2)}%)</span>
                  </div>
                </div>
                <div className='bg-slate-900 rounded p-3'>
                  <div className='text-slate-400 text-xs mb-1'>Buy & Hold</div>
                  <div
                    className={`text-lg font-bold ${backtestResult.buyAndHoldPnl >= 0 ? "text-green-400" : "text-red-400"}`}
                  >
                    {backtestResult.buyAndHoldPnl >= 0 ? "+" : ""}${backtestResult.buyAndHoldPnl.toFixed(2)}
                    <span className='text-sm ml-1'>({backtestResult.buyAndHoldPnlPercent.toFixed(2)}%)</span>
                  </div>
                </div>
                <div className='bg-slate-900 rounded p-3'>
                  <div className='text-slate-400 text-xs mb-1'>Win Rate</div>
                  <div className='text-lg font-bold text-white'>
                    {backtestResult.winRate.toFixed(1)}%
                    <span className='text-sm text-slate-400 ml-1'>
                      ({backtestResult.winningTrades}W / {backtestResult.losingTrades}L)
                    </span>
                  </div>
                </div>
                <div className='bg-slate-900 rounded p-3'>
                  <div className='text-slate-400 text-xs mb-1'>Profit Factor</div>
                  <div
                    className={`text-lg font-bold ${backtestResult.profitFactor >= 1 ? "text-green-400" : "text-red-400"}`}
                  >
                    {backtestResult.profitFactor === Infinity ? "∞" : backtestResult.profitFactor.toFixed(2)}
                  </div>
                </div>
                <div className='bg-slate-900 rounded p-3'>
                  <div className='text-slate-400 text-xs mb-1'>Max Drawdown</div>
                  <div className='text-lg font-bold text-red-400'>
                    -${backtestResult.maxDrawdown.toFixed(2)}
                    <span className='text-sm ml-1'>({backtestResult.maxDrawdownPercent.toFixed(2)}%)</span>
                  </div>
                </div>
                <div className='bg-slate-900 rounded p-3'>
                  <div className='text-slate-400 text-xs mb-1'>Sharpe Ratio</div>
                  <div
                    className={`text-lg font-bold ${backtestResult.sharpeRatio >= 1 ? "text-green-400" : backtestResult.sharpeRatio >= 0 ? "text-yellow-400" : "text-red-400"}`}
                  >
                    {backtestResult.sharpeRatio.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Secondary stats */}
              <div className='grid grid-cols-6 gap-4 text-sm mt-2'>
                <div className='text-center'>
                  <span className='text-slate-400 text-xs'>Trades:</span>
                  <span className='ml-1 text-white'>{backtestResult.totalTrades}</span>
                </div>
                <div className='text-center'>
                  <span className='text-slate-400 text-xs'>Avg Win:</span>
                  <span className='ml-1 text-green-400'>${backtestResult.averageWin.toFixed(2)}</span>
                </div>
                <div className='text-center'>
                  <span className='text-slate-400 text-xs'>Avg Loss:</span>
                  <span className='ml-1 text-red-400'>-${backtestResult.averageLoss.toFixed(2)}</span>
                </div>
                <div className='text-center col-span-2'>
                  <span className='text-slate-400 text-xs'>Alpha vs B&H:</span>
                  <span
                    className={`ml-1 font-bold ${backtestResult.totalPnlPercent - backtestResult.buyAndHoldPnlPercent >= 0 ? "text-green-400" : "text-red-400"}`}
                  >
                    {backtestResult.totalPnlPercent - backtestResult.buyAndHoldPnlPercent >= 0 ? "+" : ""}
                    {(backtestResult.totalPnlPercent - backtestResult.buyAndHoldPnlPercent).toFixed(2)}%
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

          {/* Chart */}
          <div className='flex-1 overflow-hidden'>
            <BacktestChart
              data={indicatorData}
              trades={backtestResult?.trades || []}
              equityCurve={backtestResult?.equityCurve || []}
              visibleCandles={visibleCandles}
              onVisibleCandlesChange={setVisibleCandles}
              showEquityCurve={showEquityCurve}
            />
          </div>

          {/* Trade Log */}
          {backtestResult && backtestResult.trades.length > 0 && (
            <div className='h-48 border-t border-slate-700 overflow-hidden flex flex-col'>
              <div className='px-4 py-2 bg-slate-800 text-sm font-semibold border-b border-slate-700'>
                Trade Log ({backtestResult.trades.length} trades)
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
                    {backtestResult.trades.map((trade) => (
                      <tr key={trade.id} className='border-b border-slate-800 hover:bg-slate-800/50'>
                        <td
                          className={`px-3 py-2 font-semibold ${trade.side === PositionSide.LONG ? "text-green-400" : "text-red-400"}`}
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
    </div>
  );
}
