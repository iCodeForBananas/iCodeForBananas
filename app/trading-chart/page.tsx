"use client";

import React, { useState, useEffect, useRef } from "react";
import Chart from "../components/Chart";
import Navigation from "../components/Navigation";
import { PricePoint, Position, PositionSide, Account } from "@/app/types";

const RISK_PERCENTAGE = 0.005; // 0.5%
const INITIAL_BALANCE = 100000; // $100k starting capital
const CACHE_KEY = "spy_data_cache";
const CACHE_EXPIRY_KEY = "spy_data_cache_expiry";
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export default function TradingChartPage() {
  const [data, setData] = useState<PricePoint[]>([]);
  const [account, setAccount] = useState<Account>({ balance: INITIAL_BALANCE, riskPercentage: RISK_PERCENTAGE });
  const [positions, setPositions] = useState<Position[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(true);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const currentIndexRef = useRef(currentIndex);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  // Load SPY data on mount
  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        setError(null);

        // Try to load from cache first
        const cachedData = localStorage.getItem(CACHE_KEY);
        const cacheExpiry = localStorage.getItem(CACHE_EXPIRY_KEY);

        if (cachedData && cacheExpiry && Date.now() < parseInt(cacheExpiry)) {
          const parsed = JSON.parse(cachedData);
          if (parsed && parsed.length > 0) {
            console.log("Loaded data from cache:", parsed.length, "candles");
            setData(parsed);
            setCurrentPrice(parsed[parsed.length - 1]?.close || 0);
            setCurrentIndex(parsed.length - 1);
            setIsLoading(false);
            return;
          }
        }

        // Fetch from API route
        console.log("Fetching SPY data from API...");
        const response = await fetch("/api/spy-data");
        const result = await response.json();

        if (!result.success || !result.data || result.data.length === 0) {
          throw new Error(result.error || "No data received from API");
        }

        console.log("Fetched", result.data.length, "candles");
        setData(result.data);
        setCurrentPrice(result.data[result.data.length - 1]?.close || 0);
        setCurrentIndex(result.data.length - 1);

        // Cache the data
        localStorage.setItem(CACHE_KEY, JSON.stringify(result.data));
        localStorage.setItem(CACHE_EXPIRY_KEY, (Date.now() + CACHE_DURATION).toString());
      } catch (err) {
        console.error("Error loading SPY data:", err);
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, []);

  // Move to useEffect below stepForward to ensure we access latest state

  const calculatePositionSize = (entryPrice: number, sma20: number): number => {
    const riskAmount = account.balance * account.riskPercentage;
    const riskPerShare = Math.abs(entryPrice - sma20);
    if (riskPerShare === 0) return 0;
    return Math.floor(riskAmount / riskPerShare);
  };

  const openPosition = (side: PositionSide) => {
    const executePosition = () => {
      // Close any existing positions first
      flattenAllPositions();

      const currentCandle = data[currentIndex];
      if (!currentCandle.sma20) {
        alert("SMA20 not available yet. Need at least 20 candles.");
        return;
      }

      const entryPrice = currentPrice;
      const sma20 = currentCandle.sma20;

      const size = calculatePositionSize(entryPrice, sma20);

      if (size === 0) {
        alert("Position size is too small. Price is too close to SMA20.");
        return;
      }

      const now = Date.now();
      const newPosition: Position = {
        id: now.toString(),
        side,
        entryPrice,
        size,
        entryTime: now,
        stopLoss: sma20, // Using SMA20 as initial reference
        status: "open",
      };

      setPositions([newPosition]);
    };

    executePosition();
  };

  const flattenAllPositions = () => {
    setPositions((prev) => {
      const closedPositions = prev.map((pos) => {
        if (pos.status === "open") {
          const exitPrice = currentPrice;
          const pnl =
            pos.side === PositionSide.LONG
              ? (exitPrice - pos.entryPrice) * pos.size
              : (pos.entryPrice - exitPrice) * pos.size;

          setAccount((acc) => ({ ...acc, balance: acc.balance + pnl }));

          return {
            ...pos,
            status: "closed" as const,
            exitPrice,
            exitTime: Date.now(),
            pnl,
          };
        }
        return pos;
      });

      return closedPositions;
    });
  };

  const startRandom = () => {
    if (data.length < 200) return;

    // Pick a random index. Ensure we have at least 200 candles history or just some padding at start
    const minStart = Math.min(200, data.length - 1);
    const maxStart = Math.max(minStart, data.length - 100); // Ensure we have room to play

    const randomIdx = Math.floor(Math.random() * (maxStart - minStart + 1)) + minStart;

    setCurrentIndex(randomIdx);
    if (data[randomIdx]) {
      setCurrentPrice(data[randomIdx].close);
    }

    // Reset simulation state
    setIsPaused(true);
    setPositions([]);
  };

  const stepForward = () => {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= data.length) {
      setIsPaused(true);
      return;
    }

    const currentCandle = data[nextIndex];
    let pnlToAdd = 0;

    const nextPositions = positions.map((pos) => {
      if (pos.status === "open" && currentCandle.sma20) {
        const shouldClose =
          (pos.side === PositionSide.LONG && currentCandle.close < currentCandle.sma20) ||
          (pos.side === PositionSide.SHORT && currentCandle.close > currentCandle.sma20);

        if (shouldClose) {
          const exitPrice = currentCandle.close;
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
          };
        }
      }
      return pos;
    });

    // Update all state synchronously
    setCurrentIndex(nextIndex);
    setCurrentPrice(currentCandle.close);
    setPositions(nextPositions);
    if (pnlToAdd !== 0) {
      setAccount((acc) => ({ ...acc, balance: acc.balance + pnlToAdd }));
    }
  };

  useEffect(() => {
    if (isPaused) return;
    const timeout = setTimeout(stepForward, 2000);
    return () => clearTimeout(timeout);
  });

  const openPositions = positions.filter((p) => p.status === "open");
  const totalPnL = openPositions.reduce((sum, pos) => {
    const unrealizedPnL =
      pos.side === PositionSide.LONG
        ? (currentPrice - pos.entryPrice) * pos.size
        : (pos.entryPrice - currentPrice) * pos.size;
    return sum + unrealizedPnL;
  }, 0);

  const accountValue = account.balance + totalPnL;

  // Show only data up to current index for replay functionality
  const visibleData = data.slice(Math.max(0, currentIndex - 200), currentIndex + 1);

  if (isLoading) {
    return (
      <div className='flex flex-col flex-1'>
        <Navigation />
        <main className='px-4 py-6 flex-1 metronome-static'>
          <div className='w-full lg:max-w-7xl lg:mx-auto'>
            <div className='rounded-lg border border-border bg-white p-4 shadow-sm'>
              <div className='flex items-center justify-center h-96'>
                <div className='text-center'>
                  <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600 mx-auto mb-4'></div>
                  <p className='text-gray-600'>Loading SPY historical data from Yahoo Finance...</p>
                  <p className='text-sm text-gray-400 mt-2'>Fetching 60 days of 5-minute candles</p>
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
        <Navigation />
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
    <div className='flex flex-col flex-1'>
      <Navigation />
      <main className='px-4 py-6 flex-1 metronome-static'>
        <div className='w-full lg:max-w-7xl lg:mx-auto'>
          <div className='rounded-lg border border-border bg-white p-4 shadow-sm'>
            <div className='flex justify-between items-center mb-4'>
              <div>
                <h1 className='text-2xl font-bold'>SPY Trading - 5min Chart</h1>
                <p className='text-xs text-gray-500 mt-1'>
                  Showing {currentIndex + 1} / {data.length} candles |
                  {data.length > 0 &&
                    ` ${new Date(data[0].time).toLocaleDateString()} - ${new Date(data[data.length - 1].time).toLocaleDateString()}`}
                </p>
              </div>
              <div className='text-sm text-gray-600'>Risk: {(account.riskPercentage * 100).toFixed(2)}% per trade</div>
            </div>

            {/* Chart */}
            <div className='bg-slate-50 rounded-lg p-4 mb-4'>
              <div className='h-[500px]'>
                <Chart data={visibleData} positions={positions} currentPrice={currentPrice} />
              </div>
            </div>

            {/* Trading Controls */}
            <div className='bg-slate-50 rounded-lg p-4 mb-4 border border-border'>
              <div className='flex flex-wrap gap-4 items-center'>
                <div className='flex gap-2'>
                  <button
                    onClick={() => setIsPaused(!isPaused)}
                    className={`px-6 py-2 font-semibold rounded-md transition-colors ${
                      isPaused
                        ? "bg-blue-600 hover:bg-blue-700 text-white"
                        : "bg-orange-600 hover:bg-orange-700 text-white"
                    }`}
                  >
                    {isPaused ? "▶ PLAY" : "⏸ PAUSE"}
                  </button>
                  <button
                    onClick={stepForward}
                    disabled={!isPaused}
                    className='px-4 py-2 bg-purple-600 text-white font-semibold rounded-md hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors'
                  >
                    ⏭ STEP
                  </button>
                  <button
                    onClick={startRandom}
                    disabled={data.length === 0}
                    className='px-4 py-2 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors'
                  >
                    🎲 RANDOM
                  </button>

                  <button
                    onClick={() => openPosition(PositionSide.LONG)}
                    disabled={openPositions.length > 0}
                    className='px-6 py-2 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors'
                  >
                    GO LONG
                  </button>

                  <button
                    onClick={() => openPosition(PositionSide.SHORT)}
                    disabled={openPositions.length > 0}
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
                  const currentSma20 = data[currentIndex]?.sma20 || pos.stopLoss || 0;
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
                        <span className='text-gray-600'>SMA20 (Stop):</span>
                        <span className='ml-2 font-semibold text-red-600'>${currentSma20.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className='text-gray-600'>Risk:</span>
                        <span className='ml-2 font-semibold'>
                          ${(Math.abs(pos.entryPrice - currentSma20) * pos.size).toFixed(2)}
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
    </div>
  );
}
