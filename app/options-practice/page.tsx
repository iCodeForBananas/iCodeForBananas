"use client";

import React, { useState, useEffect, useRef } from "react";
import OptionsPracticeChart, { OptionTrade } from "../components/OptionsPracticeChart";
import { PricePoint, Account } from "@/app/types";

const INITIAL_BALANCE = 100000;
const DEFAULT_VISIBLE_CANDLES = 200;

interface DatasetInfo {
  file: string;
  symbol: string;
  timeframe: string;
  date: string;
  label: string;
}

export default function OptionsPracticePage() {
  const [allData, setAllData] = useState<PricePoint[]>([]);
  const [visibleIndex, setVisibleIndex] = useState<number>(0);
  const [account, setAccount] = useState<Account>({ balance: INITIAL_BALANCE, riskPercentage: 0 });
  const [trade, setTrade] = useState<OptionTrade | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [availableDatasets, setAvailableDatasets] = useState<DatasetInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [visibleCandles, setVisibleCandles] = useState<number>(DEFAULT_VISIBLE_CANDLES);
  const [strike, setStrike] = useState<number>(0);
  const [premium, setPremium] = useState<number>(1.5);
  const [contracts, setContracts] = useState<number>(1);
  const [entryIndexInput, setEntryIndexInput] = useState<number>(0);

  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const currentPrice = allData[visibleIndex]?.close || 0;

  useEffect(() => {
    async function fetchDatasets() {
      try {
        const response = await fetch("/api/data-files");
        const result = await response.json();
        if (result.success && result.files.length > 0) {
          setAvailableDatasets(result.files);
          setSelectedFile(result.files[0].file);
        }
      } catch (err) {
        console.error("Error fetching datasets:", err);
      }
    }
    fetchDatasets();
  }, []);

  useEffect(() => {
    if (!selectedFile) return;

    async function loadData() {
      try {
        setIsLoading(true);
        setError(null);
        setIsPlaying(false);
        setTrade(null);

        const response = await fetch(`/api/spy-data?file=${encodeURIComponent(selectedFile)}&donchianPeriod=10`);
        const result = await response.json();

        if (!result.success || !result.data || result.data.length === 0) {
          throw new Error(result.error || "No data received from API");
        }

        setAllData(result.data);
        const startIndex = Math.min(200, result.data.length - 1);
        setVisibleIndex(startIndex);
        setEntryIndexInput(startIndex);
        setStrike(result.data[startIndex]?.close ? Number(result.data[startIndex].close.toFixed(2)) : 0);
      } catch (err) {
        console.error("Error loading data:", err);
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [selectedFile]);

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
    setEntryIndexInput(randomIdx);
    setIsPlaying(false);
    setTrade(null);
  };

  const resetAccount = () => {
    if (
      window.confirm(
        "Reset your account and clear the open trade? This will restore the balance to $" +
          INITIAL_BALANCE.toLocaleString() +
          ".",
      )
    ) {
      setAccount({ balance: INITIAL_BALANCE, riskPercentage: 0 });
      setTrade(null);
      setVisibleIndex(Math.min(200, allData.length - 1));
      setIsPlaying(false);
    }
  };

  const openTrade = () => {
    if (!allData.length) return;
    if (trade?.status === "open") {
      alert("Flatten the current trade before opening a new one.");
      return;
    }

    const entryIndex = Math.min(Math.max(entryIndexInput, 0), allData.length - 1);
    if (entryIndex > visibleIndex) {
      alert("Entry time must be at or before the current candle.");
      return;
    }

    if (strike <= 0 || premium <= 0 || contracts <= 0) {
      alert("Strike, premium, and contracts must be greater than zero.");
      return;
    }

    const entryPrice = allData[entryIndex].close;
    const entryCost = premium * contracts * 100;
    if (account.balance < entryCost) {
      alert("Insufficient balance for this option premium.");
      return;
    }

    setAccount((prev) => ({ ...prev, balance: prev.balance - entryCost }));

    setTrade({
      id: Date.now().toString(),
      strike,
      premium,
      contracts,
      entryIndex,
      entryTime: allData[entryIndex].time,
      entryUnderlying: entryPrice,
      entryCost,
      status: "open",
    });
  };

  const flattenTrade = () => {
    if (!trade || trade.status !== "open") return;
    if (visibleIndex < trade.entryIndex) {
      alert("Exit time must be after entry.");
      return;
    }

    const exitPrice = allData[visibleIndex]?.close;
    if (exitPrice === undefined) return;

    const exitValue = Math.max(0, exitPrice - trade.strike) * trade.contracts * 100;
    const pnl = exitValue - trade.entryCost;

    setAccount((prev) => ({ ...prev, balance: prev.balance + exitValue }));
    setTrade({
      ...trade,
      status: "closed",
      exitIndex: visibleIndex,
      exitTime: allData[visibleIndex].time,
      exitUnderlying: exitPrice,
      pnl,
    });
    setIsPlaying(false);
  };

  const openOptionValue =
    trade?.status === "open" ? Math.max(0, currentPrice - trade.strike) * trade.contracts * 100 : 0;
  const unrealizedPnl = trade?.status === "open" ? openOptionValue - trade.entryCost : 0;
  const accountValue = account.balance + openOptionValue;

  if (isLoading) {
    return (
      <div className='flex flex-col flex-1 h-screen overflow-hidden'>
        <main className='px-2 sm:px-4 py-4 flex-1'>
          <div className='w-full'>
            <div className='rounded-lg border border-border bg-white p-4 shadow-sm'>
              <div className='flex items-center justify-center h-[50vh]'>
                <div className='text-center'>
                  <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto mb-4'></div>
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
                    className='px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700'
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
          <div className='bg-slate-900 rounded-lg p-1 sm:p-2 mb-2 sm:mb-4'>
            <div className='h-[40vh] sm:h-[45vh] md:h-[50vh] lg:h-[55vh] xl:h-[60vh]'>
              <OptionsPracticeChart
                data={allData}
                trade={trade}
                currentPrice={currentPrice}
                visibleIndex={visibleIndex}
                visibleCandles={visibleCandles}
                onVisibleCandlesChange={setVisibleCandles}
                strike={strike}
              />
            </div>
          </div>

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
                  onClick={openTrade}
                  className='px-3 sm:px-6 py-1.5 sm:py-2 text-xs sm:text-base bg-emerald-600 text-white font-semibold rounded-md hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors'
                >
                  BUY CALL
                </button>
                <button
                  onClick={flattenTrade}
                  disabled={!trade || trade.status !== "open"}
                  className='px-3 sm:px-6 py-1.5 sm:py-2 text-xs sm:text-base bg-amber-600 text-white font-semibold rounded-md hover:bg-amber-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors'
                >
                  FLATTEN
                </button>
              </div>
            </div>

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

          <div className='bg-slate-50 rounded-lg p-2 sm:p-4 mb-2 sm:mb-4 border border-border'>
            <div className='grid grid-cols-1 lg:grid-cols-4 gap-3'>
              <label className='flex flex-col gap-1 text-xs sm:text-sm font-semibold text-gray-700'>
                Strike
                <input
                  type='number'
                  step='0.01'
                  value={strike}
                  onChange={(e) => setStrike(Number(e.target.value))}
                  className='px-3 py-2 text-xs sm:text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700'
                />
              </label>
              <label className='flex flex-col gap-1 text-xs sm:text-sm font-semibold text-gray-700'>
                Entry Premium
                <input
                  type='number'
                  step='0.01'
                  value={premium}
                  onChange={(e) => setPremium(Number(e.target.value))}
                  className='px-3 py-2 text-xs sm:text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700'
                />
              </label>
              <label className='flex flex-col gap-1 text-xs sm:text-sm font-semibold text-gray-700'>
                Contracts (100x)
                <input
                  type='number'
                  min={1}
                  step='1'
                  value={contracts}
                  onChange={(e) => setContracts(Math.max(1, Number(e.target.value)))}
                  className='px-3 py-2 text-xs sm:text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700'
                />
              </label>
              <label className='flex flex-col gap-1 text-xs sm:text-sm font-semibold text-gray-700'>
                Entry Candle Index
                <div className='flex gap-2'>
                  <input
                    type='number'
                    min={0}
                    max={Math.max(0, allData.length - 1)}
                    value={entryIndexInput}
                    onChange={(e) => setEntryIndexInput(Number(e.target.value))}
                    className='w-full px-3 py-2 text-xs sm:text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700'
                  />
                  <button
                    type='button'
                    onClick={() => setEntryIndexInput(visibleIndex)}
                    className='px-3 py-2 text-xs sm:text-sm font-semibold bg-slate-200 rounded-md hover:bg-slate-300'
                  >
                    Use Now
                  </button>
                </div>
                <span className='text-[11px] text-gray-500'>
                  {allData[entryIndexInput]
                    ? new Date(allData[entryIndexInput].time).toLocaleString()
                    : ""}
                </span>
              </label>
            </div>
          </div>

          <div className='bg-slate-50 rounded-lg p-2 sm:p-4 mb-2 sm:mb-4 border border-border'>
            <div className='flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4'>
              <label className='text-xs sm:text-sm font-semibold text-gray-700'>Dataset:</label>
              <select
                value={selectedFile}
                onChange={(e) => setSelectedFile(e.target.value)}
                disabled={isLoading || availableDatasets.length === 0}
                className='px-3 py-2 text-xs sm:text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50 disabled:cursor-not-allowed'
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
              <h2 className='text-xs sm:text-sm font-semibold text-gray-600 mb-1 sm:mb-2'>Unrealized P&L</h2>
              <p
                className={`text-sm sm:text-xl lg:text-2xl font-bold truncate ${unrealizedPnl >= 0 ? "text-green-600" : "text-red-600"}`}
              >
                {unrealizedPnl >= 0 ? "+" : ""}$
                {unrealizedPnl.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
            </div>

            <div className='bg-slate-50 rounded-lg p-2 sm:p-4 border border-border'>
              <h2 className='text-xs sm:text-sm font-semibold text-gray-600 mb-1 sm:mb-2'>Last Trade P&L</h2>
              <p
                className={`text-sm sm:text-xl lg:text-2xl font-bold truncate ${
                  trade?.pnl === undefined
                    ? "text-gray-400"
                    : trade.pnl >= 0
                      ? "text-green-600"
                      : "text-red-600"
                }`}
              >
                {trade?.pnl !== undefined
                  ? `${trade.pnl >= 0 ? "+" : ""}$${trade.pnl.toLocaleString(undefined, {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}`
                  : "—"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
