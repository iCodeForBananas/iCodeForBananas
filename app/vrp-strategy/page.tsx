"use client";

import React, { useState, useEffect, useRef } from "react";
import VRPChart from "../components/VRPChart";
import { PricePoint, Position, PositionSide, Account } from "@/app/types";

const RISK_PERCENTAGE = 0.01; // 2% risk per trade for options strategies
const INITIAL_BALANCE = 100000;
const NOTIONAL_MULTIPLIER = 100; // Options control 100 shares per contract
const DEFAULT_VISIBLE_CANDLES = 200;
const STORAGE_KEY = "vrpStrategyGameState";

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
  rvPeriod: number;
  ivMultiplier: number;
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

// Calculate realized volatility
function calculateRealizedVolatility(data: PricePoint[], endIndex: number, period: number): number {
  if (endIndex < period || period < 2) return 0;

  const returns: number[] = [];
  for (let i = endIndex - period + 1; i <= endIndex; i++) {
    if (i > 0 && data[i] && data[i - 1]) {
      const logReturn = Math.log(data[i].close / data[i - 1].close);
      returns.push(logReturn);
    }
  }

  if (returns.length < 2) return 0;

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
  const stdDev = Math.sqrt(variance);

  const annualizationFactor = Math.sqrt(252);
  return stdDev * annualizationFactor * 100;
}

// Calculate implied volatility (simulated)
function calculateImpliedVolatility(
  realizedVol: number,
  priceData: PricePoint[],
  endIndex: number,
  multiplier: number,
): number {
  if (realizedVol === 0) return 0;

  let ivPremium = multiplier;

  if (endIndex >= 5 && priceData[endIndex]) {
    const recentReturn = (priceData[endIndex].close - priceData[endIndex - 5].close) / priceData[endIndex - 5].close;
    if (recentReturn < -0.02) {
      ivPremium += 0.2 * Math.abs(recentReturn / 0.02);
    } else if (recentReturn > 0.02) {
      ivPremium -= 0.05 * (recentReturn / 0.02);
    }
  }

  ivPremium = Math.max(1.0, Math.min(1.8, ivPremium));

  return realizedVol * ivPremium;
}

export default function VRPStrategyPage() {
  const [allData, setAllData] = useState<PricePoint[]>([]);
  const [visibleIndex, setVisibleIndex] = useState<number>(0);
  const [account, setAccount] = useState<Account>({ balance: INITIAL_BALANCE, riskPercentage: RISK_PERCENTAGE });
  const [positions, setPositions] = useState<Position[]>([]);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [availableDatasets, setAvailableDatasets] = useState<DatasetInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [rvPeriod, setRvPeriod] = useState<number>(20);
  const [ivMultiplier, setIvMultiplier] = useState<number>(1.15);
  const [visibleCandles, setVisibleCandles] = useState<number>(DEFAULT_VISIBLE_CANDLES);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  const initialStateRef = useRef<Partial<GameState> | null>(null);
  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const currentPrice = allData[visibleIndex]?.close || 0;

  // Calculate current VRP values
  const currentRV = calculateRealizedVolatility(allData, visibleIndex, rvPeriod);
  const currentIV = calculateImpliedVolatility(currentRV, allData, visibleIndex, ivMultiplier);
  const currentVRP = currentIV - currentRV;
  const isPositiveVRP = currentVRP > 0;

  // Load saved state on mount
  useEffect(() => {
    const savedState = loadGameState();
    if (savedState) {
      initialStateRef.current = savedState;
      if (savedState.account) setAccount(savedState.account);
      if (savedState.positions) setPositions(savedState.positions);
      if (savedState.rvPeriod) setRvPeriod(savedState.rvPeriod);
      if (savedState.ivMultiplier) setIvMultiplier(savedState.ivMultiplier);
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
            // Prefer ES=F (E-mini S&P 500 futures) for VRP strategy
            const esFutures = result.files.find((f: DatasetInfo) => f.symbol === "ES=F");
            setSelectedFile(esFutures?.file || result.files[0].file);
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

        const response = await fetch(`/api/spy-data?file=${encodeURIComponent(selectedFile)}&smaPeriod=${rvPeriod}`);
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
  }, [selectedFile, rvPeriod]);

  // Save game state to localStorage
  useEffect(() => {
    if (!isInitialized || !selectedFile) return;

    saveGameState({
      visibleIndex,
      account,
      positions,
      selectedFile,
      rvPeriod,
      ivMultiplier,
      visibleCandles,
    });
  }, [isInitialized, visibleIndex, account, positions, selectedFile, rvPeriod, ivMultiplier, visibleCandles]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, allData.length]);

  // VRP-based position management
  // The strategy: Sell premium (short volatility) when IV > RV (positive VRP)
  // NOTE: No automatic stop-outs - you control when to exit
  // In real options trading, you manage risk with position sizing and hedging, not hard stops
  // Premium sellers typically hold through volatility to collect theta decay

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

  const calculatePositionSize = (entryPrice: number): number => {
    const riskAmount = account.balance * account.riskPercentage;
    // For selling premium, we're collecting the VRP spread
    // Position size based on notional exposure we can afford to risk
    // Each "contract" represents 100 shares worth of premium sold
    // Risk per contract is roughly the max expected move (2 std devs)
    const maxMove = entryPrice * (currentIV / 100) * 0.1; // ~10% of annual IV as short-term risk
    const riskPerContract = maxMove * NOTIONAL_MULTIPLIER;
    if (riskPerContract === 0) return 0;
    return Math.max(1, Math.floor(riskAmount / riskPerContract));
  };

  // Open a "sell premium" position (short volatility)
  const sellPremium = () => {
    if (!isPositiveVRP) {
      alert("VRP is not positive. Wait for IV > RV to sell premium.");
      return;
    }

    flattenAllPositions();

    const entryPrice = currentPrice;
    const size = calculatePositionSize(entryPrice);

    if (size === 0) {
      alert("Position size is too small.");
      return;
    }

    const newPosition: Position = {
      id: Date.now().toString(),
      side: PositionSide.SHORT, // Short volatility = selling premium
      entryPrice,
      size,
      entryTime: Date.now(),
      status: "open",
    };

    setPositions([newPosition]);
  };

  const flattenAllPositions = () => {
    setPositions((prev) => {
      const updated = prev.map((pos) => {
        if (pos.status === "open") {
          const exitPrice = currentPrice;
          // P&L based on:
          // 1. Premium collected (approximated as VRP spread * notional)
          // 2. Minus any adverse price movement impact
          const notional = pos.size * pos.entryPrice * NOTIONAL_MULTIPLIER;
          const vrpSpread = Math.max(0, currentVRP) / 100; // VRP as decimal
          const premiumCollected = notional * vrpSpread * 0.1; // ~10% of VRP captured per trade

          // Price movement impact (delta exposure for short vol)
          const priceChange = (exitPrice - pos.entryPrice) / pos.entryPrice;
          const deltaImpact = notional * Math.abs(priceChange) * 0.3; // 30% delta exposure

          // Net P&L: premium collected minus delta losses (if price moved significantly)
          const pnl = premiumCollected - (Math.abs(priceChange) > 0.005 ? deltaImpact : 0);

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
    // Unrealized P&L for short vol position
    const notional = pos.size * pos.entryPrice * NOTIONAL_MULTIPLIER;
    const vrpSpread = Math.max(0, currentVRP) / 100;
    const premiumAccrued = notional * vrpSpread * 0.1;

    // Current price impact
    const priceChange = (currentPrice - pos.entryPrice) / pos.entryPrice;
    const deltaImpact = notional * Math.abs(priceChange) * 0.3;

    const unrealizedPnL = premiumAccrued - (Math.abs(priceChange) > 0.005 ? deltaImpact : 0);
    return sum + unrealizedPnL;
  }, 0);
  const accountValue = account.balance + totalPnL;

  if (isLoading) {
    return (
      <div className='flex flex-col flex-1 h-screen overflow-hidden'>
        <main className='px-2 sm:px-4 py-4 flex-1'>
          <div className='w-full'>
            <div className='rounded-lg border border-border bg-white p-4 shadow-sm'>
              <div className='flex items-center justify-center h-[50vh]'>
                <div className='text-center'>
                  <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4'></div>
                  <p className='text-gray-600'>Loading market data for VRP analysis...</p>
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
        <main className='px-2 sm:px-4 py-4 flex-1'>
          <div className='w-full'>
            <div className='rounded-lg border border-border bg-white p-4 shadow-sm'>
              <div className='flex items-center justify-center h-[50vh]'>
                <div className='text-center'>
                  <div className='text-red-600 text-5xl mb-4'>⚠</div>
                  <p className='text-gray-900 font-semibold mb-2'>Error Loading Data</p>
                  <p className='text-gray-600 mb-4'>{error}</p>
                  <button
                    onClick={() => window.location.reload()}
                    className='px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700'
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
              <VRPChart
                data={allData}
                positions={positions}
                currentPrice={currentPrice}
                visibleIndex={visibleIndex}
                rvPeriod={rvPeriod}
                onRvPeriodChange={setRvPeriod}
                ivMultiplier={ivMultiplier}
                onIvMultiplierChange={setIvMultiplier}
                visibleCandles={visibleCandles}
                onVisibleCandlesChange={setVisibleCandles}
              />
            </div>
          </div>

          {/* VRP Signal Panel */}
          <div
            className={`rounded-lg p-3 sm:p-4 mb-2 sm:mb-4 border ${isPositiveVRP ? "bg-green-50 border-green-300" : "bg-red-50 border-red-300"}`}
          >
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <div>
                <span className='text-sm font-semibold text-gray-700'>Current Signal: </span>
                <span className={`text-lg font-bold ${isPositiveVRP ? "text-green-600" : "text-red-600"}`}>
                  {isPositiveVRP ? "✓ SELL PREMIUM" : "✗ AVOID / STAY FLAT"}
                </span>
              </div>
              <div className='flex gap-4 text-sm'>
                <div>
                  <span className='text-purple-600 font-semibold'>IV:</span> {currentIV.toFixed(1)}%
                </div>
                <div>
                  <span className='text-cyan-600 font-semibold'>RV:</span> {currentRV.toFixed(1)}%
                </div>
                <div>
                  <span className='text-gray-600 font-semibold'>VRP:</span>{" "}
                  <span className={isPositiveVRP ? "text-green-600" : "text-red-600"}>
                    {currentVRP >= 0 ? "+" : ""}
                    {currentVRP.toFixed(2)}%
                  </span>
                </div>
              </div>
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
                  <span className='sm:hidden'>CLOSE</span>
                  <span className='hidden sm:inline'>CLOSE POSITION</span>
                </button>
                <button
                  onClick={sellPremium}
                  disabled={openPositions.length > 0 || !isPositiveVRP}
                  className='px-3 sm:px-6 py-1.5 sm:py-2 text-xs sm:text-base bg-purple-600 text-white font-semibold rounded-md hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors'
                >
                  <span className='sm:hidden'>SELL</span>
                  <span className='hidden sm:inline'>SELL PREMIUM</span>
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
                className='px-3 py-2 text-xs sm:text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed'
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
              <h2 className='text-xs sm:text-sm font-semibold text-gray-600 mb-1 sm:mb-2'>Account Value</h2>
              <p className='text-sm sm:text-xl lg:text-2xl font-bold text-gray-900 truncate'>
                ${accountValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
            </div>

            <div className='bg-slate-50 rounded-lg p-2 sm:p-4 border border-border'>
              <h2 className='text-xs sm:text-sm font-semibold text-gray-600 mb-1 sm:mb-2'>Unrealized P&L</h2>
              <p
                className={`text-sm sm:text-xl lg:text-2xl font-bold truncate ${totalPnL >= 0 ? "text-green-600" : "text-red-600"}`}
              >
                {totalPnL >= 0 ? "+" : ""}$
                {totalPnL.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
            </div>

            <div className='bg-slate-50 rounded-lg p-2 sm:p-4 border border-border'>
              <h2 className='text-xs sm:text-sm font-semibold text-gray-600 mb-1 sm:mb-2'>VRP Edge</h2>
              <p
                className={`text-sm sm:text-xl lg:text-2xl font-bold ${isPositiveVRP ? "text-green-600" : "text-red-600"}`}
              >
                {currentVRP >= 0 ? "+" : ""}
                {currentVRP.toFixed(2)}%
              </p>
            </div>
          </div>

          {/* Position Details */}
          {openPositions.length > 0 && (
            <div className='mt-2 sm:mt-4 bg-slate-50 rounded-lg p-2 sm:p-4 border border-border'>
              <h2 className='text-sm sm:text-lg font-semibold mb-2 sm:mb-3'>Open Position (Short Volatility)</h2>
              {openPositions.map((pos) => (
                <div key={pos.id} className='grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 text-xs sm:text-sm'>
                  <div>
                    <span className='text-gray-600'>Strategy:</span>
                    <span className='ml-1 sm:ml-2 font-bold text-purple-600'>Sell Premium</span>
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
                    <span className='text-gray-600'>IV at Entry:</span>
                    <span className='ml-1 sm:ml-2 font-semibold text-purple-600'>{currentIV.toFixed(1)}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Educational Info */}
          <div className='mt-2 sm:mt-4 bg-gradient-to-r from-slate-50 to-gray-50 rounded-lg p-3 sm:p-4 border border-gray-200'>
            <h3 className='text-sm font-semibold text-gray-700 mb-2'>About Variance Risk Premium</h3>
            <ul className='text-xs sm:text-sm text-gray-600 space-y-1'>
              <li>
                • <strong>IV (Implied Volatility):</strong> What the market expects volatility to be (from option
                prices)
              </li>
              <li>
                • <strong>RV (Realized Volatility):</strong> Actual historical volatility that occurred
              </li>
              <li>
                • <strong>VRP = IV - RV:</strong> The premium investors pay for &ldquo;insurance&rdquo; beyond actual
                risk
              </li>
              <li>
                • <strong>The Edge:</strong> Historically, IV overestimates RV, making premium selling profitable
              </li>
              <li>
                • <strong>Risk:</strong> Large, sudden moves (tail events) can cause significant losses
              </li>
            </ul>
          </div>

          {/* Strategy Instructions */}
          <div className='mt-2 sm:mt-4 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg p-3 sm:p-4 border border-purple-200'>
            <h3 className='text-sm font-semibold text-purple-900 mb-3'>How to Run This Strategy</h3>
            <div className='space-y-3 text-xs sm:text-sm text-purple-800'>
              <div className='flex gap-3'>
                <span className='flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-bold'>
                  1
                </span>
                <div>
                  <strong>Wait for Positive VRP</strong>
                  <p className='text-purple-700 mt-0.5'>
                    Only enter when the VRP indicator shows green (IV {">"} RV). The signal panel will display
                    &ldquo;SELL PREMIUM ✓&rdquo; when conditions are favorable.
                  </p>
                </div>
              </div>
              <div className='flex gap-3'>
                <span className='flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-bold'>
                  2
                </span>
                <div>
                  <strong>Sell Premium</strong>
                  <p className='text-purple-700 mt-0.5'>
                    Click the &ldquo;SELL PREMIUM&rdquo; button to open a short volatility position. This simulates
                    selling options (straddles, strangles, or iron condors) to collect premium.
                  </p>
                </div>
              </div>
              <div className='flex gap-3'>
                <span className='flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-bold'>
                  3
                </span>
                <div>
                  <strong>Monitor the Spread</strong>
                  <p className='text-purple-700 mt-0.5'>
                    Watch the purple (IV) and cyan (RV) lines on the chart. You profit as long as IV stays above RV
                    (green shaded area). The wider the spread, the more edge you have.
                  </p>
                </div>
              </div>
              <div className='flex gap-3'>
                <span className='flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-bold'>
                  4
                </span>
                <div>
                  <strong>Exit Conditions</strong>
                  <p className='text-purple-700 mt-0.5'>
                    Close your position if: (a) VRP turns negative (RV spikes above IV), (b) you&apos;ve captured
                    sufficient theta decay, or (c) a large price move threatens your position.
                  </p>
                </div>
              </div>
              <div className='flex gap-3'>
                <span className='flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-bold'>
                  5
                </span>
                <div>
                  <strong>Risk Management</strong>
                  <p className='text-purple-700 mt-0.5'>
                    This strategy has limited upside but significant tail risk. Never risk more than 0.5% of your
                    account per trade. The strategy works best in calm, range-bound markets.
                  </p>
                </div>
              </div>
            </div>
            <div className='mt-4 p-3 bg-purple-100 rounded-lg border border-purple-300'>
              <p className='text-xs text-purple-900'>
                <strong>💡 Pro Tip:</strong> The best time to sell premium is when IV spikes after a market selloff
                (fear is high), but RV has not yet caught up. This is when the VRP is widest and your edge is greatest.
                Use the RANDOM button to find different market conditions and practice identifying optimal entry points.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
