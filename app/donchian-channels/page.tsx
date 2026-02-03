"use client";

import React, { useState, useEffect, useRef } from "react";
import DonchianChart from "../components/DonchianChart";
import Navigation from "../components/Navigation";
import { PricePoint, Position, PositionSide, Account } from "@/app/types";

const RISK_PERCENTAGE = 0.01; // 1% risk per trade as per strategy
const INITIAL_BALANCE = 100000;
const DEFAULT_VISIBLE_CANDLES = 200;
const STORAGE_KEY = "donchianChannelsGameState";

interface DatasetInfo {
  file: string;
  symbol: string;
  timeframe: string;
  date: string;
  label: string;
}

interface TradeStats {
  totalTrades: number;
  wins: number;
  losses: number;
  avgWin: number;
  avgLoss: number;
  winRate: number;
  expectancy: number;
  avgRRatio: number;
}

interface GameState {
  visibleIndex: number;
  account: Account;
  positions: Position[];
  selectedFile: string;
  entryPeriod: number;
  exitPeriod: number;
  atrPeriod: number;
  visibleCandles: number;
}

function loadGameState(): Partial<GameState> | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error("Failed to load game state from localStorage:", e);
  }
  return null;
}

function saveGameState(state: GameState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Failed to save game state to localStorage:", e);
  }
}

// Calculate Donchian Channel values
function calculateDonchianChannels(
  data: PricePoint[],
  endIndex: number,
  period: number,
): { upper: number; lower: number; middle: number } | null {
  if (endIndex < period - 1) return null;

  let highest = -Infinity;
  let lowest = Infinity;

  for (let i = endIndex - period + 1; i <= endIndex; i++) {
    if (data[i]) {
      if (data[i].high > highest) highest = data[i].high;
      if (data[i].low < lowest) lowest = data[i].low;
    }
  }

  if (highest === -Infinity || lowest === Infinity) return null;

  return {
    upper: highest,
    lower: lowest,
    middle: (highest + lowest) / 2,
  };
}

// Calculate Average True Range (ATR)
function calculateATR(data: PricePoint[], endIndex: number, period: number): number {
  if (endIndex < period) return 0;

  let atrSum = 0;
  for (let i = endIndex - period + 1; i <= endIndex; i++) {
    if (i > 0 && data[i] && data[i - 1]) {
      const tr = Math.max(
        data[i].high - data[i].low,
        Math.abs(data[i].high - data[i - 1].close),
        Math.abs(data[i].low - data[i - 1].close),
      );
      atrSum += tr;
    }
  }

  return atrSum / period;
}

// Extended PricePoint with Donchian data
interface DonchianPricePoint extends PricePoint {
  entryUpper?: number;
  entryLower?: number;
  entryMiddle?: number;
  exitUpper?: number;
  exitLower?: number;
  exitMiddle?: number;
  atr?: number;
}

export default function DonchianChannelsPage() {
  const [allData, setAllData] = useState<DonchianPricePoint[]>([]);
  const [visibleIndex, setVisibleIndex] = useState<number>(0);
  const [account, setAccount] = useState<Account>({ balance: INITIAL_BALANCE, riskPercentage: RISK_PERCENTAGE });
  const [positions, setPositions] = useState<Position[]>([]);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [availableDatasets, setAvailableDatasets] = useState<DatasetInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [entryPeriod, setEntryPeriod] = useState<number>(20); // 20-day Donchian for entry
  const [exitPeriod, setExitPeriod] = useState<number>(10); // 10-day Donchian for exit
  const [atrPeriod, setAtrPeriod] = useState<number>(14); // 14-day ATR
  const [visibleCandles, setVisibleCandles] = useState<number>(DEFAULT_VISIBLE_CANDLES);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [tradeStats, setTradeStats] = useState<TradeStats>({
    totalTrades: 0,
    wins: 0,
    losses: 0,
    avgWin: 0,
    avgLoss: 0,
    winRate: 0,
    expectancy: 0,
    avgRRatio: 0,
  });

  const initialStateRef = useRef<Partial<GameState> | null>(null);
  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastPausedBreakoutIndexRef = useRef<number | null>(null);

  const currentPrice = allData[visibleIndex]?.close || 0;
  const currentATR = allData[visibleIndex]?.atr || 0;
  // For breakout detection, we compare current price to PREVIOUS bar's Donchian channel
  // This is because the current bar's channel already includes the current bar's high/low
  const previousEntryChannel =
    visibleIndex > 0 && allData[visibleIndex - 1]
      ? { upper: allData[visibleIndex - 1].entryUpper, lower: allData[visibleIndex - 1].entryLower }
      : null;

  // Calculate trade statistics
  useEffect(() => {
    const closedPositions = positions.filter((p) => p.status === "closed" && p.pnl !== undefined);
    if (closedPositions.length === 0) {
      setTradeStats({
        totalTrades: 0,
        wins: 0,
        losses: 0,
        avgWin: 0,
        avgLoss: 0,
        winRate: 0,
        expectancy: 0,
        avgRRatio: 0,
      });
      return;
    }

    const wins = closedPositions.filter((p) => (p.pnl || 0) > 0);
    const losses = closedPositions.filter((p) => (p.pnl || 0) <= 0);
    const avgWin = wins.length > 0 ? wins.reduce((sum, p) => sum + (p.pnl || 0), 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((sum, p) => sum + (p.pnl || 0), 0) / losses.length) : 0;
    const winRate = closedPositions.length > 0 ? wins.length / closedPositions.length : 0;
    const expectancy = winRate * avgWin - (1 - winRate) * avgLoss;
    const avgRRatio = avgLoss > 0 ? avgWin / avgLoss : 0;

    setTradeStats({
      totalTrades: closedPositions.length,
      wins: wins.length,
      losses: losses.length,
      avgWin,
      avgLoss,
      winRate,
      expectancy,
      avgRRatio,
    });
  }, [positions]);

  // Load saved state on mount
  useEffect(() => {
    const savedState = loadGameState();
    if (savedState) {
      initialStateRef.current = savedState;
      if (savedState.account) setAccount(savedState.account);
      if (savedState.positions) setPositions(savedState.positions);
      if (savedState.entryPeriod) setEntryPeriod(savedState.entryPeriod);
      if (savedState.exitPeriod) setExitPeriod(savedState.exitPeriod);
      if (savedState.atrPeriod) setAtrPeriod(savedState.atrPeriod);
      if (savedState.visibleCandles) setVisibleCandles(savedState.visibleCandles);
    }
  }, []);

  // Fetch available datasets on mount
  useEffect(() => {
    async function fetchDatasets() {
      try {
        const response = await fetch("/api/data-files");
        const result = await response.json();
        if (result.success && result.files.length > 0) {
          // Filter for daily timeframe data (1d) as this strategy is designed for daily charts
          const dailyDatasets = result.files.filter((f: DatasetInfo) => f.timeframe === "1d");
          const datasets = dailyDatasets.length > 0 ? dailyDatasets : result.files;
          setAvailableDatasets(datasets);

          const savedState = initialStateRef.current;
          if (savedState?.selectedFile && datasets.some((f: DatasetInfo) => f.file === savedState.selectedFile)) {
            setSelectedFile(savedState.selectedFile);
          } else {
            setSelectedFile(datasets[0].file);
          }
        }
      } catch (err) {
        console.error("Error fetching datasets:", err);
      }
    }
    fetchDatasets();
  }, []);

  // Load data when selected file or periods change
  useEffect(() => {
    if (!selectedFile) return;

    async function loadData() {
      try {
        setIsLoading(true);
        setError(null);
        setIsPlaying(false);

        const savedState = initialStateRef.current;
        const isSameFile = savedState?.selectedFile === selectedFile;
        if (!isSameFile) {
          setPositions([]);
        }

        const response = await fetch(`/api/spy-data?file=${encodeURIComponent(selectedFile)}`);
        const result = await response.json();

        if (!result.success || !result.data || result.data.length === 0) {
          throw new Error(result.error || "No data received from API");
        }

        // Calculate Donchian channels and ATR for each candle
        const enrichedData: DonchianPricePoint[] = result.data.map((candle: PricePoint, index: number) => {
          const entryChannel = calculateDonchianChannels(result.data, index, entryPeriod);
          const exitChannel = calculateDonchianChannels(result.data, index, exitPeriod);
          const atr = calculateATR(result.data, index, atrPeriod);

          return {
            ...candle,
            entryUpper: entryChannel?.upper,
            entryLower: entryChannel?.lower,
            entryMiddle: entryChannel?.middle,
            exitUpper: exitChannel?.upper,
            exitLower: exitChannel?.lower,
            exitMiddle: exitChannel?.middle,
            atr,
          };
        });

        console.log("Loaded", enrichedData.length, "candles with Donchian channels from", selectedFile);
        setAllData(enrichedData);

        if (isSameFile && savedState?.visibleIndex !== undefined) {
          setVisibleIndex(Math.min(savedState.visibleIndex, enrichedData.length - 1));
        } else {
          setVisibleIndex(Math.min(entryPeriod + 10, enrichedData.length - 1));
        }

        setIsInitialized(true);
        if (isSameFile) {
          initialStateRef.current = null;
        }
      } catch (err) {
        console.error("Error loading data:", err);
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [selectedFile, entryPeriod, exitPeriod, atrPeriod]);

  // Save game state to localStorage
  useEffect(() => {
    if (!isInitialized || !selectedFile) return;

    saveGameState({
      visibleIndex,
      account,
      positions,
      selectedFile,
      entryPeriod,
      exitPeriod,
      atrPeriod,
      visibleCandles,
    });
  }, [
    isInitialized,
    visibleIndex,
    account,
    positions,
    selectedFile,
    entryPeriod,
    exitPeriod,
    atrPeriod,
    visibleCandles,
  ]);

  // Handle play/pause
  useEffect(() => {
    if (isPlaying) {
      playIntervalRef.current = setInterval(() => {
        setVisibleIndex((prev) => {
          if (prev >= allData.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 300);
    }

    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
    };
  }, [isPlaying, allData.length]);

  // Auto-pause when a breakout signal is detected (no open positions)
  // Skip if we already paused at this index (user clicked play to skip)
  useEffect(() => {
    const hasOpenPositions = positions.some((p) => p.status === "open");
    if (!isPlaying || hasOpenPositions) return;

    // Don't pause again at the same index we already paused at
    if (lastPausedBreakoutIndexRef.current === visibleIndex) return;

    const prevCandle = visibleIndex > 0 ? allData[visibleIndex - 1] : null;
    const currentClose = allData[visibleIndex]?.close || 0;

    if (prevCandle) {
      const hasLongBreakout = prevCandle.entryUpper !== undefined && currentClose >= prevCandle.entryUpper;
      const hasShortBreakout = prevCandle.entryLower !== undefined && currentClose <= prevCandle.entryLower;

      if (hasLongBreakout || hasShortBreakout) {
        lastPausedBreakoutIndexRef.current = visibleIndex;
        setIsPlaying(false);
      }
    }
  }, [visibleIndex, allData, isPlaying, positions]);

  // Check for position exits based on 10-day Donchian exit channel
  useEffect(() => {
    if (allData.length === 0 || visibleIndex >= allData.length) return;

    const currentCandle = allData[visibleIndex];
    if (!currentCandle.exitUpper || !currentCandle.exitLower) return;

    setPositions((prev) => {
      let pnlToAdd = 0;
      const updated = prev.map((pos) => {
        if (pos.status !== "open") return pos;

        let stoppedOut = false;
        let exitPrice = 0;

        // Exit logic based on 10-day Donchian channel
        if (pos.side === PositionSide.LONG) {
          // Long exits when price touches the 10-day low (exit channel lower)
          if (currentCandle.low <= currentCandle.exitLower!) {
            stoppedOut = true;
            exitPrice = Math.min(currentCandle.open, currentCandle.exitLower!);
          }
        } else {
          // Short exits when price touches the 10-day high (exit channel upper)
          if (currentCandle.high >= currentCandle.exitUpper!) {
            stoppedOut = true;
            exitPrice = Math.max(currentCandle.open, currentCandle.exitUpper!);
          }
        }

        if (stoppedOut) {
          const pnl =
            pos.side === PositionSide.LONG
              ? (exitPrice - pos.entryPrice) * pos.size
              : (pos.entryPrice - exitPrice) * pos.size;
          pnlToAdd += pnl;
          return {
            ...pos,
            status: "closed" as const,
            exitPrice,
            exitTime: Date.now(),
            pnl,
            currentStopLoss: pos.side === PositionSide.LONG ? currentCandle.exitLower : currentCandle.exitUpper,
          };
        }

        // Update trailing stop based on exit channel
        return {
          ...pos,
          currentStopLoss: pos.side === PositionSide.LONG ? currentCandle.exitLower : currentCandle.exitUpper,
        };
      });

      if (pnlToAdd !== 0) {
        setAccount((acc) => ({ ...acc, balance: acc.balance + pnlToAdd }));
      }
      return updated;
    });
  }, [visibleIndex, allData]);

  const stepForward = () => {
    if (visibleIndex < allData.length - 1) {
      setVisibleIndex((prev) => prev + 1);
    }
  };

  const stepBackward = () => {
    if (visibleIndex > 0) {
      setVisibleIndex((prev) => prev - 1);
    }
  };

  const togglePlay = () => {
    setIsPlaying((prev) => !prev);
  };

  const goToRandom = () => {
    if (allData.length < 50) return;
    const randomIdx = Math.floor(Math.random() * (allData.length - 50)) + entryPeriod + 10;
    setVisibleIndex(randomIdx);
    setIsPlaying(false);
    setPositions([]);
  };

  const resetAccount = () => {
    if (
      window.confirm(
        "Are you sure you want to reset your account to the initial balance? This will close all positions and reset your balance to $" +
          INITIAL_BALANCE.toLocaleString() +
          ".",
      )
    ) {
      setAccount({ balance: INITIAL_BALANCE, riskPercentage: RISK_PERCENTAGE });
      setPositions([]);
      setVisibleIndex(Math.min(entryPeriod + 10, allData.length - 1));
      setIsPlaying(false);
    }
  };

  // ATR-based position sizing: Position Size = (Equity × Risk%) / (ATR × Point Value)
  // For stocks/ETFs, Point Value = 1 (each $1 move = $1 per share)
  const calculatePositionSize = (entryPrice: number, atr: number): number => {
    if (atr === 0) return 0;
    const riskAmount = account.balance * account.riskPercentage;
    // Use 2x ATR as the stop distance for more realistic risk management
    const riskPerShare = atr * 2;
    return Math.floor(riskAmount / riskPerShare);
  };

  const openPosition = (side: PositionSide) => {
    const currentCandle = allData[visibleIndex];
    if (!currentCandle?.atr || !currentCandle.entryUpper || !currentCandle.entryLower) {
      alert("Donchian channels or ATR not available yet.");
      return;
    }

    // Close existing positions first
    flattenAllPositions();

    const entryPrice = currentPrice;
    const size = calculatePositionSize(entryPrice, currentCandle.atr);

    if (size === 0) {
      alert("Position size is too small based on ATR risk management.");
      return;
    }

    // Set initial stop loss at the exit channel
    const stopLoss = side === PositionSide.LONG ? currentCandle.exitLower! : currentCandle.exitUpper!;

    const newPosition: Position = {
      id: Date.now().toString(),
      side,
      entryPrice,
      size,
      entryTime: Date.now(),
      stopLoss,
      currentStopLoss: stopLoss,
      status: "open",
    };

    setPositions((prev) => [...prev, newPosition]);

    // Auto-play after opening a position
    setIsPlaying(true);
  };

  const flattenAllPositions = () => {
    setPositions((prev) => {
      const updated = prev.map((pos) => {
        if (pos.status === "open") {
          const exitPrice = currentPrice;
          const pnl =
            pos.side === PositionSide.LONG
              ? (exitPrice - pos.entryPrice) * pos.size
              : (pos.entryPrice - exitPrice) * pos.size;

          setAccount((acc) => ({ ...acc, balance: acc.balance + pnl }));

          return { ...pos, status: "closed" as const, exitPrice, exitTime: Date.now(), pnl };
        }
        return pos;
      });
      return updated;
    });
  };

  // Check for breakout signals - compare current close to PREVIOUS bar's channel
  const isLongBreakout = previousEntryChannel?.upper !== undefined && currentPrice >= previousEntryChannel.upper;
  const isShortBreakout = previousEntryChannel?.lower !== undefined && currentPrice <= previousEntryChannel.lower;

  const openPositions = positions.filter((p) => p.status === "open");
  const totalPnL = openPositions.reduce((sum, pos) => {
    const unrealizedPnL =
      pos.side === PositionSide.LONG
        ? (currentPrice - pos.entryPrice) * pos.size
        : (pos.entryPrice - currentPrice) * pos.size;
    return sum + unrealizedPnL;
  }, 0);
  const accountValue = account.balance + totalPnL;

  // Handle Enter key for quick trade entry/exit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !isLoading) {
        e.preventDefault();
        const currentCandle = allData[visibleIndex];
        if (!currentCandle?.entryUpper || !currentCandle?.entryLower) return;

        if (openPositions.length > 0) {
          flattenAllPositions();
        } else {
          // Enter based on breakout
          if (isLongBreakout) {
            openPosition(PositionSide.LONG);
          } else if (isShortBreakout) {
            openPosition(PositionSide.SHORT);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allData, visibleIndex, currentPrice, openPositions.length, isLoading, isLongBreakout, isShortBreakout]);

  if (isLoading) {
    return (
      <div className='flex flex-col flex-1 h-screen overflow-hidden'>
        <Navigation />
        <main className='px-2 sm:px-4 py-4 flex-1'>
          <div className='w-full'>
            <div className='rounded-lg border border-border bg-white p-4 shadow-sm'>
              <div className='flex items-center justify-center h-[50vh]'>
                <div className='text-center'>
                  <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4'></div>
                  <p className='text-gray-600'>Loading data with Donchian Channels...</p>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className='flex flex-col flex-1 h-screen overflow-hidden'>
        <main className='px-2 sm:px-4 py-4 flex-1 metronome-static'>
          <div className='w-full'>
            <div className='rounded-lg border border-border bg-white p-4 shadow-sm'>
              <div className='flex items-center justify-center h-[50vh]'>
                <div className='text-center'>
                  <div className='text-red-600 text-5xl mb-4'>⚠</div>
                  <p className='text-gray-900 font-semibold mb-2'>Error Loading Data</p>
                  <p className='text-gray-600 mb-4'>{error}</p>
                  <button
                    onClick={() => window.location.reload()}
                    className='px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700'
                  >
                    Retry
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <main className='flex-1 metronome-static h-screen overflow-y-auto'>
      <div className='w-full'>
        <div className='rounded-lg px-2 sm:px-4 py-2 sm:py-3 shadow-sm'>
          {/* Strategy Info Banner */}
          <div className='bg-gradient-to-r from-emerald-50 to-teal-50 rounded-lg p-3 mb-3 border border-emerald-200'>
            <div className='flex flex-wrap gap-4 text-xs sm:text-sm'>
              <div className='flex items-center gap-2'>
                <span className='font-semibold text-emerald-700'>Strategy:</span>
                <span className='text-gray-700'>Systematic Trend Following</span>
              </div>
              <div className='flex items-center gap-2'>
                <span className='font-semibold text-emerald-700'>Entry Signal:</span>
                <span className='text-gray-700'>{entryPeriod}-day Donchian Breakout</span>
              </div>
              <div className='flex items-center gap-2'>
                <span className='font-semibold text-emerald-700'>Exit Signal:</span>
                <span className='text-gray-700'>{exitPeriod}-day Donchian Trailing Stop</span>
              </div>
              <div className='flex items-center gap-2'>
                <span className='font-semibold text-emerald-700'>Risk/Trade:</span>
                <span className='text-gray-700'>{(RISK_PERCENTAGE * 100).toFixed(1)}% (ATR-based sizing)</span>
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className='bg-slate-900 rounded-lg p-1 sm:p-2 mb-2 sm:mb-4'>
            <div className='h-[40vh] sm:h-[45vh] md:h-[50vh] lg:h-[55vh] xl:h-[60vh]'>
              <DonchianChart
                data={allData}
                positions={positions}
                currentPrice={currentPrice}
                visibleIndex={visibleIndex}
                entryPeriod={entryPeriod}
                onEntryPeriodChange={setEntryPeriod}
                exitPeriod={exitPeriod}
                onExitPeriodChange={setExitPeriod}
                visibleCandles={visibleCandles}
                onVisibleCandlesChange={setVisibleCandles}
              />
            </div>
          </div>

          {/* Playback Controls */}
          <div className='bg-slate-50 rounded-lg p-2 sm:p-4 mb-2 sm:mb-4 border border-border'>
            <div className='flex flex-wrap gap-1.5 sm:gap-3 items-center justify-between'>
              <div className='flex flex-wrap gap-1.5 sm:gap-3 items-center'>
                <button
                  onClick={stepBackward}
                  disabled={visibleIndex <= 0}
                  className='px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-base bg-gray-600 text-white font-semibold rounded-md hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors'
                >
                  ⏮ <span className='hidden sm:inline'>BACK</span>
                </button>
                <button
                  onClick={togglePlay}
                  className={`px-3 sm:px-6 py-1.5 sm:py-2 text-xs sm:text-base font-semibold rounded-md transition-colors ${
                    isPlaying
                      ? "bg-orange-600 hover:bg-orange-700 text-white"
                      : "bg-blue-600 hover:bg-blue-700 text-white"
                  }`}
                >
                  {isPlaying ? "⏸" : "▶"} <span className='hidden sm:inline'>{isPlaying ? "PAUSE" : "PLAY"}</span>
                </button>
                <button
                  onClick={stepForward}
                  disabled={visibleIndex >= allData.length - 1}
                  className='px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-base bg-purple-600 text-white font-semibold rounded-md hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors'
                >
                  ⏭ <span className='hidden sm:inline'>STEP</span>
                </button>
                <button
                  onClick={goToRandom}
                  disabled={allData.length < 50}
                  className='px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-base bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors'
                >
                  🎲 <span className='hidden sm:inline'>RANDOM</span>
                </button>
                <button
                  onClick={resetAccount}
                  className='px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-base bg-rose-600 text-white font-semibold rounded-md hover:bg-rose-700 transition-colors'
                >
                  🔄 <span className='hidden sm:inline'>RESET</span>
                </button>
              </div>

              <div className='flex flex-wrap gap-1.5 sm:gap-3 items-center'>
                <button
                  onClick={flattenAllPositions}
                  disabled={openPositions.length === 0}
                  className='px-3 sm:px-6 py-1.5 sm:py-2 text-xs sm:text-base bg-orange-600 text-white font-semibold rounded-md hover:bg-orange-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors'
                >
                  <span className='sm:hidden'>FLAT</span>
                  <span className='hidden sm:inline'>FLATTEN</span>
                </button>
                <button
                  onClick={() => openPosition(PositionSide.LONG)}
                  disabled={openPositions.length > 0 || !isLongBreakout}
                  className={`px-3 sm:px-6 py-1.5 sm:py-2 text-xs sm:text-base font-semibold rounded-md transition-colors ${
                    isLongBreakout && openPositions.length === 0
                      ? "bg-green-600 hover:bg-green-700 text-white animate-pulse"
                      : "bg-green-600 text-white disabled:bg-gray-300 disabled:cursor-not-allowed"
                  }`}
                >
                  <span className='sm:hidden'>LONG</span>
                  <span className='hidden sm:inline'>LONG ▲</span>
                </button>
                <button
                  onClick={() => openPosition(PositionSide.SHORT)}
                  disabled={openPositions.length > 0 || !isShortBreakout}
                  className={`px-3 sm:px-6 py-1.5 sm:py-2 text-xs sm:text-base font-semibold rounded-md transition-colors ${
                    isShortBreakout && openPositions.length === 0
                      ? "bg-red-600 hover:bg-red-700 text-white animate-pulse"
                      : "bg-red-600 text-white disabled:bg-gray-300 disabled:cursor-not-allowed"
                  }`}
                >
                  <span className='sm:hidden'>SHORT</span>
                  <span className='hidden sm:inline'>SHORT ▼</span>
                </button>
              </div>
            </div>

            {/* Progress bar */}
            <div className='mt-2 sm:mt-4'>
              <input
                type='range'
                min={0}
                max={allData.length - 1}
                value={visibleIndex}
                onChange={(e) => setVisibleIndex(parseInt(e.target.value))}
                className='w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer'
              />
            </div>
          </div>

          {/* Data Source Selector */}
          <div className='bg-slate-50 rounded-lg p-2 sm:p-4 mb-2 sm:mb-4 border border-border'>
            <div className='flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4'>
              <label className='text-xs sm:text-sm font-semibold text-gray-700'>Dataset:</label>
              <select
                value={selectedFile}
                onChange={(e) => setSelectedFile(e.target.value)}
                disabled={isLoading || availableDatasets.length === 0}
                className='px-3 py-2 text-xs sm:text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed'
              >
                {availableDatasets.map((dataset) => (
                  <option key={dataset.file} value={dataset.file}>
                    {dataset.label} ({dataset.date})
                  </option>
                ))}
              </select>
              <span className='text-xs text-gray-500'>💡 Recommended: Daily timeframe for this strategy</span>
            </div>
          </div>

          {/* Account Stats */}
          <div className='grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 mb-2 sm:mb-4'>
            <div className='bg-slate-50 rounded-lg p-2 sm:p-4 border border-border'>
              <h2 className='text-xs sm:text-sm font-semibold text-gray-600 mb-1 sm:mb-2'>Balance</h2>
              <p className='text-sm sm:text-xl lg:text-2xl font-bold text-gray-900 truncate'>
                ${account.balance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
            </div>

            <div className='bg-slate-50 rounded-lg p-2 sm:p-4 border border-border'>
              <h2 className='text-xs sm:text-sm font-semibold text-gray-600 mb-1 sm:mb-2'>Value</h2>
              <p className='text-sm sm:text-xl lg:text-2xl font-bold text-gray-900 truncate'>
                ${accountValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
            </div>

            <div className='bg-slate-50 rounded-lg p-2 sm:p-4 border border-border'>
              <h2 className='text-xs sm:text-sm font-semibold text-gray-600 mb-1 sm:mb-2'>Open P&L</h2>
              <p
                className={`text-sm sm:text-xl lg:text-2xl font-bold truncate ${totalPnL >= 0 ? "text-green-600" : "text-red-600"}`}
              >
                {totalPnL >= 0 ? "+" : ""}$
                {totalPnL.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
            </div>

            <div className='bg-slate-50 rounded-lg p-2 sm:p-4 border border-border'>
              <h2 className='text-xs sm:text-sm font-semibold text-gray-600 mb-1 sm:mb-2'>ATR ({atrPeriod})</h2>
              <p className='text-sm sm:text-xl lg:text-2xl font-bold text-emerald-600'>${currentATR.toFixed(2)}</p>
            </div>
          </div>

          {/* Trade Statistics - Expectancy Math */}
          <div className='bg-gradient-to-r from-slate-50 to-gray-50 rounded-lg p-2 sm:p-4 mb-2 sm:mb-4 border border-border'>
            <h2 className='text-sm sm:text-lg font-semibold mb-2 sm:mb-3 text-gray-800'>
              📊 Statistical Expectancy (E = W×AW - L×AL)
            </h2>
            <div className='grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 sm:gap-4'>
              <div className='text-center p-2 bg-white rounded-lg border'>
                <p className='text-xs text-gray-500'>Trades</p>
                <p className='text-lg font-bold text-gray-900'>{tradeStats.totalTrades}</p>
              </div>
              <div className='text-center p-2 bg-white rounded-lg border'>
                <p className='text-xs text-gray-500'>Wins</p>
                <p className='text-lg font-bold text-green-600'>{tradeStats.wins}</p>
              </div>
              <div className='text-center p-2 bg-white rounded-lg border'>
                <p className='text-xs text-gray-500'>Losses</p>
                <p className='text-lg font-bold text-red-600'>{tradeStats.losses}</p>
              </div>
              <div className='text-center p-2 bg-white rounded-lg border'>
                <p className='text-xs text-gray-500'>Win Rate</p>
                <p className='text-lg font-bold text-blue-600'>{(tradeStats.winRate * 100).toFixed(1)}%</p>
              </div>
              <div className='text-center p-2 bg-white rounded-lg border'>
                <p className='text-xs text-gray-500'>Avg Win</p>
                <p className='text-lg font-bold text-green-600'>
                  ${tradeStats.avgWin.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              </div>
              <div className='text-center p-2 bg-white rounded-lg border'>
                <p className='text-xs text-gray-500'>Avg Loss</p>
                <p className='text-lg font-bold text-red-600'>
                  ${tradeStats.avgLoss.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              </div>
              <div className='text-center p-2 bg-white rounded-lg border'>
                <p className='text-xs text-gray-500'>R-Ratio</p>
                <p className='text-lg font-bold text-purple-600'>{tradeStats.avgRRatio.toFixed(2)}:1</p>
              </div>
              <div className='text-center p-2 bg-emerald-50 rounded-lg border border-emerald-200'>
                <p className='text-xs text-emerald-600 font-semibold'>Expectancy</p>
                <p className={`text-lg font-bold ${tradeStats.expectancy >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  ${tradeStats.expectancy.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              </div>
            </div>
          </div>

          {/* Position Details */}
          {openPositions.length > 0 && (
            <div className='bg-slate-50 rounded-lg p-2 sm:p-4 border border-border'>
              <h2 className='text-sm sm:text-lg font-semibold mb-2 sm:mb-3'>Open Position</h2>
              {openPositions.map((pos) => {
                const currentExitStop =
                  pos.side === PositionSide.LONG
                    ? allData[visibleIndex]?.exitLower || pos.stopLoss
                    : allData[visibleIndex]?.exitUpper || pos.stopLoss;
                return (
                  <div
                    key={pos.id}
                    className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4 text-xs sm:text-sm'
                  >
                    <div>
                      <span className='text-gray-600'>Side:</span>
                      <span
                        className={`ml-1 sm:ml-2 font-bold ${pos.side === PositionSide.LONG ? "text-green-600" : "text-red-600"}`}
                      >
                        {pos.side}
                      </span>
                    </div>
                    <div>
                      <span className='text-gray-600'>Size:</span>
                      <span className='ml-1 sm:ml-2 font-semibold'>{pos.size}</span>
                    </div>
                    <div>
                      <span className='text-gray-600'>Entry:</span>
                      <span className='ml-1 sm:ml-2 font-semibold'>${pos.entryPrice.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className='text-gray-600'>Exit Stop:</span>
                      <span className='ml-1 sm:ml-2 font-semibold text-orange-600'>${currentExitStop?.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className='text-gray-600'>Risk:</span>
                      <span className='ml-1 sm:ml-2 font-semibold'>
                        ${(Math.abs(pos.entryPrice - (currentExitStop || 0)) * pos.size).toFixed(0)}
                      </span>
                    </div>
                    <div className='col-span-2 sm:col-span-1'>
                      <span className='text-gray-600'>ATR:</span>
                      <span className='ml-1 sm:ml-2 font-semibold text-emerald-600'>${currentATR.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Breakout Signals */}
          {(isLongBreakout || isShortBreakout) && openPositions.length === 0 && (
            <div
              className={`mt-2 sm:mt-4 rounded-lg p-3 border-2 ${
                isLongBreakout ? "bg-green-50 border-green-400 text-green-800" : "bg-red-50 border-red-400 text-red-800"
              }`}
            >
              <p className='font-bold text-center'>
                🚨 {isLongBreakout ? "LONG" : "SHORT"} BREAKOUT SIGNAL! Price{" "}
                {isLongBreakout ? "hit the 20-day high" : "hit the 20-day low"}. Press Enter or click the button to
                enter.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
