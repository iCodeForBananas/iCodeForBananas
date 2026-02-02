"use client";

import React, { useState, useEffect, useRef } from "react";
import Chart from "../components/Chart";
import Navigation from "../components/Navigation";
import { PricePoint, Position, PositionSide, Account } from "@/app/types";

const RISK_PERCENTAGE = 0.005;
const INITIAL_BALANCE = 100000;

const TIMEFRAMES = [
  { value: "1m", label: "1 Minute" },
  { value: "5m", label: "5 Minutes" },
  { value: "15m", label: "15 Minutes" },
  { value: "30m", label: "30 Minutes" },
  { value: "1h", label: "1 Hour" },
  { value: "1d", label: "Daily" },
];

export default function TradingChartPage() {
  const [allData, setAllData] = useState<PricePoint[]>([]);
  const [visibleIndex, setVisibleIndex] = useState<number>(0);
  const [account, setAccount] = useState<Account>({ balance: INITIAL_BALANCE, riskPercentage: RISK_PERCENTAGE });
  const [positions, setPositions] = useState<Position[]>([]);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<string>("5m");
  const [trailstopSmaPeriod, setTrailstopSmaPeriod] = useState<number>(20);

  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Current price based on visible index
  const currentPrice = allData[visibleIndex]?.close || 0;

  // Load SPY data when timeframe changes
  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        setError(null);
        setIsPlaying(false);
        setPositions([]);

        const response = await fetch(`/api/spy-data?timeframe=${timeframe}&smaPeriod=${trailstopSmaPeriod}`);
        const result = await response.json();

        if (!result.success || !result.data || result.data.length === 0) {
          throw new Error(result.error || "No data received from API");
        }

        console.log("Loaded", result.data.length, "candles for", timeframe);
        setAllData(result.data);
        // Start at candle 200 so we have SMA data
        setVisibleIndex(Math.min(200, result.data.length - 1));
      } catch (err) {
        console.error("Error loading SPY data:", err);
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [timeframe, trailstopSmaPeriod]);

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
  useEffect(() => {
    if (allData.length === 0 || visibleIndex >= allData.length) return;

    const currentCandle = allData[visibleIndex];
    if (!currentCandle.trailstopSma) return;

    setPositions((prev) => {
      let pnlToAdd = 0;
      const updated = prev.map((pos) => {
        if (pos.status !== "open") return pos;

        const shouldClose =
          (pos.side === PositionSide.LONG && currentCandle.close < currentCandle.trailstopSma!) ||
          (pos.side === PositionSide.SHORT && currentCandle.close > currentCandle.trailstopSma!);

        if (shouldClose) {
          const exitPrice = currentCandle.close;
          const pnl =
            pos.side === PositionSide.LONG
              ? (exitPrice - pos.entryPrice) * pos.size
              : (pos.entryPrice - exitPrice) * pos.size;
          pnlToAdd += pnl;
          return { ...pos, status: "closed" as const, exitPrice, exitTime: Date.now(), pnl };
        }
        return pos;
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
      stopLoss: currentCandle.trailstopSma,
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
      <div className='flex flex-col flex-1'>
        <Navigation />
        <main className='px-4 py-6 flex-1'>
          <div className='w-full lg:max-w-7xl lg:mx-auto'>
            <div className='rounded-lg border border-border bg-white p-4 shadow-sm'>
              <div className='flex items-center justify-center h-96'>
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
      <div className='flex flex-col flex-1'>
        <main className='px-4 py-6 flex-1 metronome-static'>
          <div className='w-full lg:max-w-7xl lg:mx-auto'>
            <div className='rounded-lg border border-border bg-white p-4 shadow-sm'>
              <div className='flex items-center justify-center h-96'>
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
    <main className='flex-1 metronome-static'>
      <div className='w-full lg:mx-auto'>
        <div className='rounded-lg px-4 py-3 shadow-sm'>
          {/* Chart */}
          <div className='bg-slate-900 rounded-lg p-2 mb-4'>
            <div className='h-[70vh]'>
              <Chart
                data={allData}
                positions={positions}
                currentPrice={currentPrice}
                visibleIndex={visibleIndex}
                trailstopSmaPeriod={trailstopSmaPeriod}
                onTrailstopSmaPeriodChange={setTrailstopSmaPeriod}
              />
            </div>
          </div>

          {/* Playback Controls */}
          <div className='bg-slate-50 rounded-lg p-4 mb-4 border border-border'>
            <div className='flex flex-wrap gap-3 items-center'>
              <button
                onClick={stepBackward}
                disabled={visibleIndex <= 0}
                className='px-4 py-2 bg-gray-600 text-white font-semibold rounded-md hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors'
              >
                ⏮ BACK
              </button>
              <button
                onClick={togglePlay}
                className={`px-6 py-2 font-semibold rounded-md transition-colors ${
                  isPlaying
                    ? "bg-orange-600 hover:bg-orange-700 text-white"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                }`}
              >
                {isPlaying ? "⏸ PAUSE" : "▶ PLAY"}
              </button>
              <button
                onClick={stepForward}
                disabled={visibleIndex >= allData.length - 1}
                className='px-4 py-2 bg-purple-600 text-white font-semibold rounded-md hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors'
              >
                ⏭ STEP
              </button>
              <button
                onClick={goToRandom}
                disabled={allData.length < 300}
                className='px-4 py-2 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors'
              >
                🎲 RANDOM
              </button>

              <div className='border-l border-gray-300 h-8 mx-2'></div>

              <button
                onClick={() => openPosition(PositionSide.LONG)}
                disabled={openPositions.length > 0 || currentPrice < (allData[visibleIndex]?.trailstopSma ?? 0)}
                className='px-6 py-2 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors'
              >
                GO LONG
              </button>
              <button
                onClick={() => openPosition(PositionSide.SHORT)}
                disabled={openPositions.length > 0 || currentPrice > (allData[visibleIndex]?.trailstopSma ?? Infinity)}
                className='px-6 py-2 bg-red-600 text-white font-semibold rounded-md hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors'
              >
                GO SHORT
              </button>
              <button
                onClick={flattenAllPositions}
                disabled={openPositions.length === 0}
                className='px-6 py-2 bg-orange-600 text-white font-semibold rounded-md hover:bg-orange-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors'
              >
                FLATTEN
              </button>
            </div>

            {/* Progress bar */}
            <div className='mt-4'>
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
          <div className='bg-slate-50 rounded-lg p-4 mb-4 border border-border'>
            <div className='flex items-center gap-4'>
              <label className='text-sm font-semibold text-gray-700'>Data Source:</label>
              <div className='flex gap-2'>
                {TIMEFRAMES.map((tf) => (
                  <button
                    key={tf.value}
                    onClick={() => setTimeframe(tf.value)}
                    disabled={isLoading}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                      timeframe === tf.value
                        ? "bg-cyan-600 text-white"
                        : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>
              {isLoading && <span className='text-sm text-gray-500 animate-pulse'>Loading...</span>}
            </div>
          </div>

          {/* Account Stats */}
          <div className='grid grid-cols-4 gap-4'>
            <div className='bg-slate-50 rounded-lg p-4 border border-border'>
              <h2 className='text-sm font-semibold text-gray-600 mb-2'>Account Balance</h2>
              <p className='text-2xl font-bold text-gray-900'>
                ${account.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>

            <div className='bg-slate-50 rounded-lg p-4 border border-border'>
              <h2 className='text-sm font-semibold text-gray-600 mb-2'>Account Value</h2>
              <p className='text-2xl font-bold text-gray-900'>
                ${accountValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>

            <div className='bg-slate-50 rounded-lg p-4 border border-border'>
              <h2 className='text-sm font-semibold text-gray-600 mb-2'>Unrealized P&L</h2>
              <p className={`text-2xl font-bold ${totalPnL >= 0 ? "text-green-600" : "text-red-600"}`}>
                {totalPnL >= 0 ? "+" : ""}$
                {totalPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>

            <div className='bg-slate-50 rounded-lg p-4 border border-border'>
              <h2 className='text-sm font-semibold text-gray-600 mb-2'>Current Price (SPY)</h2>
              <p className='text-2xl font-bold text-cyan-600'>${currentPrice.toFixed(2)}</p>
            </div>
          </div>

          {/* Position Details */}
          {openPositions.length > 0 && (
            <div className='mt-4 bg-slate-50 rounded-lg p-4 border border-border'>
              <h2 className='text-lg font-semibold mb-3'>Open Position</h2>
              {openPositions.map((pos) => {
                const currentTrailstopSma = allData[visibleIndex]?.trailstopSma || pos.stopLoss || 0;
                return (
                  <div key={pos.id} className='grid grid-cols-5 gap-4 text-sm'>
                    <div>
                      <span className='text-gray-600'>Side:</span>
                      <span
                        className={`ml-2 font-bold ${pos.side === PositionSide.LONG ? "text-green-600" : "text-red-600"}`}
                      >
                        {pos.side}
                      </span>
                    </div>
                    <div>
                      <span className='text-gray-600'>Size:</span>
                      <span className='ml-2 font-semibold'>{pos.size} shares</span>
                    </div>
                    <div>
                      <span className='text-gray-600'>Entry:</span>
                      <span className='ml-2 font-semibold'>${pos.entryPrice.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className='text-gray-600'>Trail SMA (Stop):</span>
                      <span className='ml-2 font-semibold text-red-600'>${currentTrailstopSma.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className='text-gray-600'>Risk:</span>
                      <span className='ml-2 font-semibold'>
                        ${(Math.abs(pos.entryPrice - currentTrailstopSma) * pos.size).toFixed(2)}
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
