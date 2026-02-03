"use client";

import React, { useState, useEffect, useRef } from "react";
import Chart from "../components/Chart";
import Navigation from "../components/Navigation";
import { PricePoint, Position, PositionSide, Account } from "@/app/types";

const RISK_PERCENTAGE = 0.005;
const INITIAL_BALANCE = 100000;
const DEFAULT_VISIBLE_CANDLES = 200;
const STORAGE_KEY = "tradingChartGameState";

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
  positions: Position[];
  selectedFile: string;
  trailstopSmaPeriod: number;
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

export default function TradingChartPage() {
  const [allData, setAllData] = useState<PricePoint[]>([]);
  const [visibleIndex, setVisibleIndex] = useState<number>(0);
  const [account, setAccount] = useState<Account>({ balance: INITIAL_BALANCE, riskPercentage: RISK_PERCENTAGE });
  const [positions, setPositions] = useState<Position[]>([]);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [availableDatasets, setAvailableDatasets] = useState<DatasetInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [trailstopSmaPeriod, setTrailstopSmaPeriod] = useState<number>(20);
  const [visibleCandles, setVisibleCandles] = useState<number>(DEFAULT_VISIBLE_CANDLES);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  
  const initialStateRef = useRef<Partial<GameState> | null>(null);

  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Current price based on visible index
  const currentPrice = allData[visibleIndex]?.close || 0;

  // Load saved state on mount
  useEffect(() => {
    const savedState = loadGameState();
    if (savedState) {
      initialStateRef.current = savedState;
      if (savedState.account) setAccount(savedState.account);
      if (savedState.positions) setPositions(savedState.positions);
      if (savedState.trailstopSmaPeriod) setTrailstopSmaPeriod(savedState.trailstopSmaPeriod);
      if (savedState.visibleCandles) setVisibleCandles(savedState.visibleCandles);
      // selectedFile and visibleIndex will be applied after datasets load
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
          // Use saved file if available, otherwise first file
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
        
        // Only reset positions if this is a different file than saved
        const savedState = initialStateRef.current;
        const isSameFile = savedState?.selectedFile === selectedFile;
        if (!isSameFile) {
          setPositions([]);
        }

        const response = await fetch(`/api/spy-data?file=${encodeURIComponent(selectedFile)}&smaPeriod=${trailstopSmaPeriod}`);
        const result = await response.json();

        if (!result.success || !result.data || result.data.length === 0) {
          throw new Error(result.error || "No data received from API");
        }

        console.log("Loaded", result.data.length, "candles from", selectedFile);
        setAllData(result.data);
        
        // Restore saved visibleIndex if same file, otherwise start at candle 200
        if (isSameFile && savedState?.visibleIndex !== undefined) {
          setVisibleIndex(Math.min(savedState.visibleIndex, result.data.length - 1));
        } else {
          setVisibleIndex(Math.min(200, result.data.length - 1));
        }
        
        // Mark as initialized after first load
        setIsInitialized(true);
        // Clear the initial state ref so subsequent file changes don't try to restore
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
  }, [selectedFile, trailstopSmaPeriod]);

  // Save game state to localStorage whenever relevant values change
  useEffect(() => {
    if (!isInitialized || !selectedFile) return;
    
    saveGameState({
      visibleIndex,
      account,
      positions,
      selectedFile,
      trailstopSmaPeriod,
      visibleCandles,
    });
  }, [isInitialized, visibleIndex, account, positions, selectedFile, trailstopSmaPeriod, visibleCandles]);

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

  // Check for position stop-outs when index changes
  // Uses realistic price execution: checks high/low, handles gaps, uses stop price when candle crosses through
  useEffect(() => {
    if (allData.length === 0 || visibleIndex >= allData.length) return;

    const currentCandle = allData[visibleIndex];
    if (!currentCandle.trailstopSma) return;

    setPositions((prev) => {
      let pnlToAdd = 0;
      const updated = prev.map((pos) => {
        if (pos.status !== "open") return pos;

        const currentStop = pos.currentStopLoss ?? pos.stopLoss ?? currentCandle.trailstopSma!;
        const initialRisk = Math.abs(pos.entryPrice - (pos.stopLoss ?? currentStop));

        // Calculate unrealized P&L to check for 1R
        const unrealizedPnL =
          pos.side === PositionSide.LONG ? currentCandle.close - pos.entryPrice : pos.entryPrice - currentCandle.close;
        const unrealizedR = initialRisk > 0 ? unrealizedPnL / initialRisk : 0;

        // Determine new trailing stop level
        let newStopLoss = currentStop;

        // Trail stop based on SMA, but only in favorable direction
        if (pos.side === PositionSide.LONG) {
          // For long: only move stop UP (trail up towards price)
          if (currentCandle.trailstopSma! > currentStop) {
            newStopLoss = currentCandle.trailstopSma!;
          }
        } else {
          // For short: only move stop DOWN (trail down towards price)
          if (currentCandle.trailstopSma! < currentStop) {
            newStopLoss = currentCandle.trailstopSma!;
          }
        }

        // After 1R of unrealized gains, move stop to break-even (entry price)
        if (unrealizedR >= 1.0) {
          if (pos.side === PositionSide.LONG) {
            // For long: stop must be at least at entry price
            newStopLoss = Math.max(newStopLoss, pos.entryPrice);
          } else {
            // For short: stop must be at most at entry price
            newStopLoss = Math.min(newStopLoss, pos.entryPrice);
          }
        }

        // Check if stopped out using realistic price execution
        let stoppedOut = false;
        let exitPrice = 0;

        if (pos.side === PositionSide.LONG) {
          // Long position: stopped out if low goes below stop
          if (currentCandle.low <= newStopLoss) {
            stoppedOut = true;
            // Check for gap down (open below stop)
            if (currentCandle.open < newStopLoss) {
              // Gap down - must take the open price (slippage)
              exitPrice = currentCandle.open;
            } else {
              // Candle traded through stop - get stop price
              exitPrice = newStopLoss;
            }
          }
        } else {
          // Short position: stopped out if high goes above stop
          if (currentCandle.high >= newStopLoss) {
            stoppedOut = true;
            // Check for gap up (open above stop)
            if (currentCandle.open > newStopLoss) {
              // Gap up - must take the open price (slippage)
              exitPrice = currentCandle.open;
            } else {
              // Candle traded through stop - get stop price
              exitPrice = newStopLoss;
            }
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
            currentStopLoss: newStopLoss,
          };
        }

        // Update the trailing stop
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

  const calculatePositionSize = (entryPrice: number, trailstopSma: number): number => {
    const riskAmount = account.balance * account.riskPercentage;
    const riskPerShare = Math.abs(entryPrice - trailstopSma);
    if (riskPerShare === 0) return 0;
    return Math.floor(riskAmount / riskPerShare);
  };

  const openPosition = (side: PositionSide) => {
    const currentCandle = allData[visibleIndex];
    if (!currentCandle?.trailstopSma) {
      alert("Trailstop SMA not available yet.");
      return;
    }

    // Close existing positions first
    flattenAllPositions();

    const entryPrice = currentPrice;
    const size = calculatePositionSize(entryPrice, currentCandle.trailstopSma);

    if (size === 0) {
      alert("Position size is too small.");
      return;
    }

    const newPosition: Position = {
      id: Date.now().toString(),
      side,
      entryPrice,
      size,
      entryTime: Date.now(),
      stopLoss: currentCandle.trailstopSma, // Initial stop loss (defines 1R)
      currentStopLoss: currentCandle.trailstopSma, // Trailing stop (will update)
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
        if (!currentCandle?.trailstopSma) return;

        if (openPositions.length > 0) {
          // Flatten existing position
          flattenAllPositions();
        } else {
          // Open new position based on price vs trailstop SMA
          if (currentPrice > currentCandle.trailstopSma) {
            openPosition(PositionSide.LONG);
          } else if (currentPrice < currentCandle.trailstopSma) {
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
        <Navigation />
        <main className='px-2 sm:px-4 py-4 flex-1'>
          <div className='w-full'>
            <div className='rounded-lg border border-border bg-white p-4 shadow-sm'>
              <div className='flex items-center justify-center h-[50vh]'>
                <div className='text-center'>
                  <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600 mx-auto mb-4'></div>
                  <p className='text-gray-600'>Loading SPY data...</p>
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
          {/* Chart */}
          <div className='bg-slate-900 rounded-lg p-1 sm:p-2 mb-2 sm:mb-4'>
            <div className='h-[40vh] sm:h-[45vh] md:h-[50vh] lg:h-[55vh] xl:h-[60vh]'>
              <Chart
                data={allData}
                positions={positions}
                currentPrice={currentPrice}
                visibleIndex={visibleIndex}
                trailstopSmaPeriod={trailstopSmaPeriod}
                onTrailstopSmaPeriodChange={setTrailstopSmaPeriod}
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
                  disabled={openPositions.length > 0 || currentPrice < (allData[visibleIndex]?.trailstopSma ?? 0)}
                  className='px-3 sm:px-6 py-1.5 sm:py-2 text-xs sm:text-base bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors'
                >
                  <span className='sm:hidden'>LONG</span>
                  <span className='hidden sm:inline'>LONG</span>
                </button>
                <button
                  onClick={() => openPosition(PositionSide.SHORT)}
                  disabled={
                    openPositions.length > 0 || currentPrice > (allData[visibleIndex]?.trailstopSma ?? Infinity)
                  }
                  className='px-3 sm:px-6 py-1.5 sm:py-2 text-xs sm:text-base bg-red-600 text-white font-semibold rounded-md hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors'
                >
                  <span className='sm:hidden'>SHORT</span>
                  <span className='hidden sm:inline'>SHORT</span>
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
              <h2 className='text-xs sm:text-sm font-semibold text-gray-600 mb-1 sm:mb-2'>SPY Price</h2>
              <p className='text-sm sm:text-xl lg:text-2xl font-bold text-cyan-600'>${currentPrice.toFixed(2)}</p>
            </div>
          </div>

          {/* Position Details */}
          {openPositions.length > 0 && (
            <div className='mt-2 sm:mt-4 bg-slate-50 rounded-lg p-2 sm:p-4 border border-border'>
              <h2 className='text-sm sm:text-lg font-semibold mb-2 sm:mb-3'>Open Position</h2>
              {openPositions.map((pos) => {
                const currentTrailstopSma = allData[visibleIndex]?.trailstopSma || pos.stopLoss || 0;
                return (
                  <div
                    key={pos.id}
                    className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-4 text-xs sm:text-sm'
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
                      <span className='text-gray-600'>Stop:</span>
                      <span className='ml-1 sm:ml-2 font-semibold text-red-600'>${currentTrailstopSma.toFixed(2)}</span>
                    </div>
                    <div className='col-span-2 sm:col-span-1'>
                      <span className='text-gray-600'>Risk:</span>
                      <span className='ml-1 sm:ml-2 font-semibold'>
                        ${(Math.abs(pos.entryPrice - currentTrailstopSma) * pos.size).toFixed(0)}
                      </span>
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
