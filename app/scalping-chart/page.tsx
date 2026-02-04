"use client";

import React, { useState, useEffect, useRef } from "react";
import ScalpingChart, { ScalpingPosition } from "../components/ScalpingChart";
import { PricePoint, PositionSide, Account } from "@/app/types";

const RISK_PERCENTAGE = 0.01;
const INITIAL_BALANCE = 100000;
const DEFAULT_VISIBLE_CANDLES = 200;
const STORAGE_KEY = "scalpingChartGameState";

interface DatasetInfo {
  file: string;
  symbol: string;
  timeframe: string;
  date: string;
  label: string;
}

interface GameState {
  visibleIndex: number;
  account: Account;
  positions: ScalpingPosition[];
  selectedFile: string;
  emaPeriod: number;
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

export default function ScalpingChartPage() {
  const [allData, setAllData] = useState<PricePoint[]>([]);
  const [visibleIndex, setVisibleIndex] = useState<number>(0);
  const [account, setAccount] = useState<Account>({ balance: INITIAL_BALANCE, riskPercentage: RISK_PERCENTAGE });
  const [positions, setPositions] = useState<ScalpingPosition[]>([]);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [availableDatasets, setAvailableDatasets] = useState<DatasetInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [emaPeriod, setEmaPeriod] = useState<number>(10);
  const [visibleCandles, setVisibleCandles] = useState<number>(DEFAULT_VISIBLE_CANDLES);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  const initialStateRef = useRef<Partial<GameState> | null>(null);
  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const currentPrice = allData[visibleIndex]?.close || 0;

  // Load saved state on mount
  useEffect(() => {
    const savedState = loadGameState();
    if (savedState) {
      initialStateRef.current = savedState;
      if (savedState.account) setAccount(savedState.account);
      if (savedState.positions) setPositions(savedState.positions);
      if (savedState.emaPeriod) setEmaPeriod(savedState.emaPeriod);
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
          setAvailableDatasets(result.files);
          const savedState = initialStateRef.current;
          if (savedState?.selectedFile && result.files.some((f: DatasetInfo) => f.file === savedState.selectedFile)) {
            setSelectedFile(savedState.selectedFile);
          } else {
            setSelectedFile(result.files[0].file);
          }
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
        setIsPlaying(false);

        const savedState = initialStateRef.current;
        const isSameFile = savedState?.selectedFile === selectedFile;
        if (!isSameFile) {
          setPositions([]);
        }

        const response = await fetch(
          `/api/spy-data?file=${encodeURIComponent(selectedFile)}&donchianPeriod=${emaPeriod}`,
        );
        const result = await response.json();

        if (!result.success || !result.data || result.data.length === 0) {
          throw new Error(result.error || "No data received from API");
        }

        console.log("Loaded", result.data.length, "candles from", selectedFile);
        setAllData(result.data);

        if (isSameFile && savedState?.visibleIndex !== undefined) {
          setVisibleIndex(Math.min(savedState.visibleIndex, result.data.length - 1));
        } else {
          setVisibleIndex(Math.min(200, result.data.length - 1));
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
  }, [selectedFile, emaPeriod]);

  // Save game state to localStorage
  useEffect(() => {
    if (!isInitialized || !selectedFile) return;

    saveGameState({
      visibleIndex,
      account,
      positions,
      selectedFile,
      emaPeriod,
      visibleCandles,
    });
  }, [isInitialized, visibleIndex, account, positions, selectedFile, emaPeriod, visibleCandles]);

  // Handle play/pause
  useEffect(() => {
    if (isPlaying && visibleIndex < allData.length - 1) {
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

  // SCALPING STRATEGY: Check for TP hits and trailing stop
  // - 1R Take Profit: Close half position
  // - 2R Take Profit: Close remaining position
  // - Trail stop at 1R once 1R is hit
  useEffect(() => {
    if (allData.length === 0 || visibleIndex >= allData.length) return;

    const currentCandle = allData[visibleIndex];

    setPositions((prev) => {
      let pnlToAdd = 0;
      const updated = prev.map((pos) => {
        if (pos.status !== "open") return pos;

        const initialRisk = pos.initialRisk ?? Math.abs(pos.entryPrice - (pos.stopLoss ?? 0));
        const currentStop = pos.currentStopLoss ?? pos.stopLoss ?? 0;

        let exitPrice = 0;
        let shouldClose = false;
        let newStopLoss = currentStop;
        let exitReason = "";

        if (pos.side === PositionSide.LONG) {
          // Check if 2R hit first (highest priority for profit)
          if (pos.takeProfit2R && currentCandle.high >= pos.takeProfit2R) {
            shouldClose = true;
            exitPrice = currentCandle.open > pos.takeProfit2R ? currentCandle.open : pos.takeProfit2R;
            exitReason = "TP 2R";
          }
          // Check if 1R hit - trail stop to breakeven
          else if (pos.takeProfit1R && currentCandle.high >= pos.takeProfit1R) {
            // Move stop to breakeven (entry price)
            newStopLoss = Math.max(currentStop, pos.entryPrice);
          }
          // Check if stopped out
          if (!shouldClose && currentCandle.low <= newStopLoss) {
            shouldClose = true;
            exitPrice = currentCandle.open < newStopLoss ? currentCandle.open : newStopLoss;
            exitReason = newStopLoss >= pos.entryPrice ? "B/E Stop" : "Stop Loss";
          }
        } else {
          // SHORT position
          // Check if 2R hit first
          if (pos.takeProfit2R && currentCandle.low <= pos.takeProfit2R) {
            shouldClose = true;
            exitPrice = currentCandle.open < pos.takeProfit2R ? currentCandle.open : pos.takeProfit2R;
            exitReason = "TP 2R";
          }
          // Check if 1R hit - trail stop to breakeven
          else if (pos.takeProfit1R && currentCandle.low <= pos.takeProfit1R) {
            // Move stop to breakeven (entry price)
            newStopLoss = Math.min(currentStop, pos.entryPrice);
          }
          // Check if stopped out
          if (!shouldClose && currentCandle.high >= newStopLoss) {
            shouldClose = true;
            exitPrice = currentCandle.open > newStopLoss ? currentCandle.open : newStopLoss;
            exitReason = newStopLoss <= pos.entryPrice ? "B/E Stop" : "Stop Loss";
          }
        }

        if (shouldClose) {
          const pnl =
            pos.side === PositionSide.LONG
              ? (exitPrice - pos.entryPrice) * pos.size
              : (pos.entryPrice - exitPrice) * pos.size;
          pnlToAdd += pnl;
          console.log(`Position closed: ${exitReason} at $${exitPrice.toFixed(2)}, PnL: $${pnl.toFixed(2)}`);
          return {
            ...pos,
            status: "closed" as const,
            exitPrice,
            exitTime: Date.now(),
            pnl,
            currentStopLoss: newStopLoss,
          };
        }

        return { ...pos, currentStopLoss: newStopLoss };
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
    if (allData.length < 300) return;
    const randomIdx = Math.floor(Math.random() * (allData.length - 300)) + 200;
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
      setVisibleIndex(Math.min(200, allData.length - 1));
      setIsPlaying(false);
    }
  };

  const calculatePositionSize = (entryPrice: number, stopLossPrice: number): number => {
    const riskAmount = account.balance * account.riskPercentage;
    const riskPerShare = Math.abs(entryPrice - stopLossPrice);
    if (riskPerShare === 0) return 0;
    return Math.floor(riskAmount / riskPerShare);
  };

  const openPosition = (side: PositionSide) => {
    const currentCandle = allData[visibleIndex];
    if (!currentCandle?.ema) {
      alert("EMA not available yet.");
      return;
    }

    // Close existing positions first
    flattenAllPositions();

    const entryPrice = currentPrice;
    const stopLoss = currentCandle.ema;
    const initialRisk = Math.abs(entryPrice - stopLoss);
    const size = calculatePositionSize(entryPrice, stopLoss);

    if (size === 0) {
      alert("Position size is too small.");
      return;
    }

    // Calculate 1R and 2R take profit levels
    let takeProfit1R: number;
    let takeProfit2R: number;

    if (side === PositionSide.LONG) {
      takeProfit1R = entryPrice + initialRisk; // 1R above entry
      takeProfit2R = entryPrice + initialRisk * 2; // 2R above entry
    } else {
      takeProfit1R = entryPrice - initialRisk; // 1R below entry
      takeProfit2R = entryPrice - initialRisk * 2; // 2R below entry
    }

    const newPosition: ScalpingPosition = {
      id: Date.now().toString(),
      side,
      entryPrice,
      size,
      entryTime: Date.now(),
      stopLoss,
      currentStopLoss: stopLoss,
      initialRisk,
      takeProfit1R,
      takeProfit2R,
      status: "open",
    };

    setPositions([newPosition]);
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
        if (!currentCandle?.ema) return;

        if (openPositions.length > 0) {
          flattenAllPositions();
        } else {
          if (currentPrice > currentCandle.ema) {
            openPosition(PositionSide.LONG);
          } else if (currentPrice < currentCandle.ema) {
            openPosition(PositionSide.SHORT);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [allData, visibleIndex, currentPrice, openPositions.length, isLoading]);

  if (isLoading) {
    return (
      <div className='flex flex-col flex-1 h-screen overflow-hidden'>
        <main className='px-2 sm:px-4 py-4 flex-1'>
          <div className='w-full'>
            <div className='rounded-lg border border-border bg-white p-4 shadow-sm'>
              <div className='flex items-center justify-center h-[50vh]'>
                <div className='text-center'>
                  <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600 mx-auto mb-4'></div>
                  <p className='text-gray-600'>Loading data...</p>
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
                    className='px-4 py-2 bg-cyan-600 text-white rounded-md hover:bg-cyan-700'
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
          <div className='bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg p-2 sm:p-3 mb-2 sm:mb-4'>
            <div className='flex items-center gap-2'>
              <span className='text-lg'>⚡</span>
              <span className='font-bold text-sm sm:text-base'>SCALPING STRATEGY</span>
              <span className='text-xs sm:text-sm opacity-90'>| TP: 1R & 2R | Trail Stop: 1R → B/E</span>
            </div>
          </div>

          {/* Chart */}
          <div className='bg-slate-900 rounded-lg p-1 sm:p-2 mb-2 sm:mb-4'>
            <div className='h-[40vh] sm:h-[45vh] md:h-[50vh] lg:h-[55vh] xl:h-[60vh]'>
              <ScalpingChart
                data={allData}
                positions={positions}
                currentPrice={currentPrice}
                visibleIndex={visibleIndex}
                emaPeriod={emaPeriod}
                onEmaPeriodChange={setEmaPeriod}
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
                  disabled={allData.length < 300}
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
                  disabled={openPositions.length > 0 || currentPrice < (allData[visibleIndex]?.ema ?? 0)}
                  className='px-3 sm:px-6 py-1.5 sm:py-2 text-xs sm:text-base bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors'
                >
                  LONG
                </button>
                <button
                  onClick={() => openPosition(PositionSide.SHORT)}
                  disabled={openPositions.length > 0 || currentPrice > (allData[visibleIndex]?.ema ?? Infinity)}
                  className='px-3 sm:px-6 py-1.5 sm:py-2 text-xs sm:text-base bg-red-600 text-white font-semibold rounded-md hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors'
                >
                  SHORT
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
                className='px-3 py-2 text-xs sm:text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed'
              >
                {availableDatasets.map((dataset) => (
                  <option key={dataset.file} value={dataset.file}>
                    {dataset.label} ({dataset.date})
                  </option>
                ))}
              </select>
              {isLoading && <span className='text-xs sm:text-sm text-gray-500 animate-pulse'>Loading...</span>}
            </div>
          </div>

          {/* Account Stats */}
          <div className='grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4'>
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
              <h2 className='text-xs sm:text-sm font-semibold text-gray-600 mb-1 sm:mb-2'>P&L</h2>
              <p
                className={`text-sm sm:text-xl lg:text-2xl font-bold truncate ${totalPnL >= 0 ? "text-green-600" : "text-red-600"}`}
              >
                {totalPnL >= 0 ? "+" : ""}$
                {totalPnL.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
            </div>

            <div className='bg-slate-50 rounded-lg p-2 sm:p-4 border border-border'>
              <h2 className='text-xs sm:text-sm font-semibold text-gray-600 mb-1 sm:mb-2'>Risk/Trade</h2>
              <p className='text-sm sm:text-xl lg:text-2xl font-bold text-amber-600'>
                $
                {(account.balance * account.riskPercentage).toLocaleString(undefined, {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                })}
              </p>
            </div>
          </div>

          {/* Position Details */}
          {openPositions.length > 0 && (
            <div className='mt-2 sm:mt-4 bg-slate-50 rounded-lg p-2 sm:p-4 border border-border'>
              <h2 className='text-sm sm:text-lg font-semibold mb-2 sm:mb-3'>Open Position - Scalping</h2>
              {openPositions.map((pos) => {
                const unrealizedPnL =
                  pos.side === PositionSide.LONG
                    ? (currentPrice - pos.entryPrice) * pos.size
                    : (pos.entryPrice - currentPrice) * pos.size;
                const unrealizedR =
                  pos.initialRisk && pos.initialRisk > 0 ? unrealizedPnL / (pos.initialRisk * pos.size) : 0;

                return (
                  <div key={pos.id} className='space-y-2'>
                    <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4 text-xs sm:text-sm'>
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
                        <span className='text-gray-600'>Stop:</span>
                        <span className='ml-1 sm:ml-2 font-semibold text-red-600'>
                          ${(pos.currentStopLoss ?? pos.stopLoss ?? 0).toFixed(2)}
                        </span>
                      </div>
                      <div>
                        <span className='text-gray-600'>TP 1R:</span>
                        <span className='ml-1 sm:ml-2 font-semibold text-green-600'>
                          ${pos.takeProfit1R?.toFixed(2)}
                        </span>
                      </div>
                      <div>
                        <span className='text-gray-600'>TP 2R:</span>
                        <span className='ml-1 sm:ml-2 font-semibold text-cyan-600'>
                          ${pos.takeProfit2R?.toFixed(2)}
                        </span>
                      </div>
                    </div>
                    <div className='flex items-center gap-4 pt-2 border-t border-gray-200'>
                      <div>
                        <span className='text-gray-600 text-xs sm:text-sm'>Unrealized:</span>
                        <span
                          className={`ml-2 font-bold text-sm sm:text-base ${unrealizedPnL >= 0 ? "text-green-600" : "text-red-600"}`}
                        >
                          {unrealizedPnL >= 0 ? "+" : ""}${unrealizedPnL.toFixed(0)}
                        </span>
                      </div>
                      <div>
                        <span className='text-gray-600 text-xs sm:text-sm'>R Multiple:</span>
                        <span
                          className={`ml-2 font-bold text-sm sm:text-base ${unrealizedR >= 0 ? "text-green-600" : "text-red-600"}`}
                        >
                          {unrealizedR >= 0 ? "+" : ""}
                          {unrealizedR.toFixed(2)}R
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
