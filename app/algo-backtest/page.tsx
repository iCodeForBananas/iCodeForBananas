"use client";

import React, { useState, useEffect, useCallback } from "react";
import BacktestChart from "../components/BacktestChart";
import { PricePoint, IndicatorData, BacktestResult, BacktestTrade, PositionSide } from "@/app/types";
import { AVAILABLE_STRATEGIES, StrategyDefinition } from "@/app/strategies";

const DEFAULT_VISIBLE_CANDLES = 300;
const INITIAL_CAPITAL = 100000;

interface DatasetInfo {
  file: string;
  symbol: string;
  timeframe: string;
  date: string;
  label: string;
}

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
function runBacktest(data: IndicatorData[], strategy: StrategyDefinition, initialCapital: number): BacktestResult {
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
      series: data.slice(0, i + 1), // Full series up to current point
    });

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
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>("ema-crossover");
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
        const strategy = AVAILABLE_STRATEGIES[selectedStrategyId];
        if (strategy) {
          const backtest = runBacktest(withIndicators, strategy, INITIAL_CAPITAL);
          setBacktestResult(backtest);
        }
      } catch (err) {
        console.error("Error loading data:", err);
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFile, selectedStrategyId]);

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
        {/* Left Panel - Strategy Selector */}
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

          {/* Strategy Selector */}
          <div className='p-4 border-b border-slate-700'>
            <label className='block text-sm text-slate-400 mb-2'>Strategy</label>
            <select
              value={selectedStrategyId}
              onChange={(e) => setSelectedStrategyId(e.target.value)}
              className='w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white'
            >
              {Object.values(AVAILABLE_STRATEGIES).map((strategy) => (
                <option key={strategy.id} value={strategy.id}>
                  {strategy.name}
                </option>
              ))}
            </select>
            <p className='text-xs text-slate-500 mt-1'>
              {AVAILABLE_STRATEGIES[selectedStrategyId]?.description}
            </p>
          </div>

          {/* Strategy Information */}
          <div className='flex-1 flex flex-col overflow-hidden p-4'>
            <div className='bg-slate-800 rounded p-4 mb-3'>
              <h3 className='text-sm font-semibold text-slate-300 mb-2'>
                {AVAILABLE_STRATEGIES[selectedStrategyId]?.name}
              </h3>
              <p className='text-xs text-slate-400 mb-3'>
                {AVAILABLE_STRATEGIES[selectedStrategyId]?.description}
              </p>
              <div className='text-xs text-slate-500 border-t border-slate-700 pt-3'>
                <p className='mb-1'>✓ Type-safe strategy handler</p>
                <p className='mb-1'>✓ No eval() or dynamic code execution</p>
                <p>✓ Full TypeScript support</p>
              </div>
            </div>

            <div className='bg-blue-900/20 border border-blue-800/30 rounded p-3'>
              <p className='text-xs text-blue-300 mb-1 font-semibold'>💡 Adding New Strategies</p>
              <p className='text-xs text-slate-400'>
                To add new strategies, see{" "}
                <code className='bg-slate-950 px-1 py-0.5 rounded text-blue-400'>
                  app/strategies/README.md
                </code>
              </p>
            </div>
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
