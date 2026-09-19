"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import BacktestChart from "../components/BacktestChart";
import EquityCurveChart from "../components/EquityCurveChart";
import BentoPageLayout from "../components/BentoPageLayout";
import { IndicatorData, PositionSide } from "@/app/types";
import {
  AVAILABLE_STRATEGIES,
  getDefaultParams,
  ParameterizedResult,
} from "@/app/strategies";
import {
  generateCombinations,
  ParameterVariationConfig,
  INITIAL_CAPITAL,
} from "@/app/lib/backtest-engine";
import { useBacktestWorker } from "./useBacktestWorker";
import BacktestProgressPanel from "./BacktestProgressPanel";

const DEFAULT_VISIBLE_CANDLES = 300;

// localStorage keys
const STORAGE_KEY_GLOBAL = "algo-backtest-global";
const STORAGE_KEY_STRATEGY_PREFIX = "algo-backtest-strategy-";

interface GlobalSettings {
  selectedStrategyId: string;
  selectedStrategyIds: string[];
  selectedFiles: string[];
  showEquityCurve: boolean;
  visibleCandles: number;
}

interface StrategySettings {
  currentParams: Record<string, number | boolean | string>;
  paramVariations: ParameterVariationConfig[];
  stopLossPercent: number;
  takeProfitPercent: number;
  enableShorts: boolean;
  // Position sizing & costs (added 2026-05-12 to fix runaway-compounding bug).
  positionSizePercent: number; // % of equity allocated per trade
  commissionBps: number;       // round-trip per fill, in basis points
  slippageBps: number;         // adverse move on each fill, in basis points
}

function loadGlobalSettings(): Partial<GlobalSettings> | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY_GLOBAL);
    if (stored) return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to load global backtest settings:", e);
  }
  return null;
}

function saveGlobalSettings(settings: GlobalSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_GLOBAL, JSON.stringify(settings));
  } catch (e) {
    console.error("Failed to save global backtest settings:", e);
  }
}

function loadStrategySettings(strategyId: string): Partial<StrategySettings> | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY_STRATEGY_PREFIX + strategyId);
    if (stored) return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to load strategy settings:", e);
  }
  return null;
}

function saveStrategySettings(strategyId: string, settings: StrategySettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_STRATEGY_PREFIX + strategyId, JSON.stringify(settings));
  } catch (e) {
    console.error("Failed to save strategy settings:", e);
  }
}

interface DatasetInfo {
  file: string;
  symbol: string;
  timeframe: string;
  date: string;
  label: string;
}


function playDing() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()

    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.connect(gain1)
    gain1.connect(ctx.destination)
    osc1.frequency.value = 880  // A5
    osc1.type = 'sine'
    gain1.gain.setValueAtTime(0.3, ctx.currentTime)
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
    osc1.start(ctx.currentTime)
    osc1.stop(ctx.currentTime + 0.4)

    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.frequency.value = 1108  // C#6
    osc2.type = 'sine'
    gain2.gain.setValueAtTime(0, ctx.currentTime + 0.15)
    gain2.gain.setValueAtTime(0.25, ctx.currentTime + 0.15)
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
    osc2.start(ctx.currentTime + 0.15)
    osc2.stop(ctx.currentTime + 0.6)
  } catch {
    // Audio not supported — fail silently
  }
}

export default function AlgoBacktestPage() {
  const [indicatorData, setIndicatorData] = useState<IndicatorData[]>([]);
  const [isRunningBatch, setIsRunningBatch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableDatasets, setAvailableDatasets] = useState<DatasetInfo[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [datasetSearch, setDatasetSearch] = useState<string>("");
  const [visibleCandles, setVisibleCandles] = useState<number>(DEFAULT_VISIBLE_CANDLES);
  const [showEquityCurve, setShowEquityCurve] = useState(true);

  // Strategy state - default on server, restored from localStorage after mount
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>("ema-crossover");
  // Multi-select: which strategies to run. The "active" one (selectedStrategyId)
  // drives the parameter editor; other selected strategies use their saved
  // per-strategy settings at run time.
  const [selectedStrategyIds, setSelectedStrategyIds] = useState<string[]>(["ema-crossover"]);
  // Accordion expand/collapse state for the strategy list — purely UI, not persisted.
  const [expandedStrategyIds, setExpandedStrategyIds] = useState<string[]>(["ema-crossover"]);
  // Mounted flag — gates render branches that read localStorage to avoid
  // SSR/CSR hydration mismatches (React #418).
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const [currentParams, setCurrentParams] = useState<Record<string, number | boolean | string>>({});
  const [paramVariations, setParamVariations] = useState<ParameterVariationConfig[]>([]);

  // Results state (multiple results for batch mode)
  const [results, setResults] = useState<ParameterizedResult[]>([]);
  const [activeResultTab, setActiveResultTab] = useState<number>(0);

  // Per-dataset indicator data cache for batch mode (maps dataset file -> IndicatorData[])
  // useRef instead of useState to avoid React holding old+new copies simultaneously
  const datasetIndicatorCache = useRef<Record<string, IndicatorData[]>>({});

  // Selected trade for chart highlighting
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);

  // Copy report state
  const [copied, setCopied] = useState(false);
  // Copy Lambda deployment prompt state
  const [lambdaPromptCopied, setLambdaPromptCopied] = useState(false);

  // Risk management state (stop loss / take profit)
  // Initialized to 0/false; the strategy change effect restores saved values
  const [stopLossPercent, setStopLossPercent] = useState<number>(1);
  const [takeProfitPercent, setTakeProfitPercent] = useState<number>(0);
  const [enableShorts, setEnableShorts] = useState<boolean>(false);
  // Sizing + costs (defaults: full allocation, no costs — match prior behavior
  // *except* shares are now locked at entry so PnL doesn't compound trade-to-
  // trade in the broken way it used to).
  const [positionSizePercent, setPositionSizePercent] = useState<number>(100);
  const [commissionBps, setCommissionBps] = useState<number>(0);
  const [slippageBps, setSlippageBps] = useState<number>(0);

  // Web Worker — owns all backtest compute. Replaces /api/backtest, which was
  // OOMing on Vercel (1.8 GB lambda heap) under multi-strategy / wide sweeps.
  const { run: runBacktestWorker, cancel: cancelBacktest, progress: backtestProgress } = useBacktestWorker();

  // Unique timeframes derived from available datasets
  const uniqueTimeframes = useMemo(() => {
    const timeframes = Array.from(new Set(availableDatasets.map((ds) => ds.timeframe)));
    // Sort by duration: minutes, hours, days, weeks
    const order: Record<string, number> = { m: 1, h: 2, d: 3, wk: 4 };
    return timeframes.sort((a, b) => {
      const unitA = a.replace(/[0-9]/g, '').toLowerCase();
      const unitB = b.replace(/[0-9]/g, '').toLowerCase();
      const numA = parseInt(a) || 1;
      const numB = parseInt(b) || 1;
      const orderDiff = (order[unitA] || 99) - (order[unitB] || 99);
      return orderDiff !== 0 ? orderDiff : numA - numB;
    });
  }, [availableDatasets]);

  const combinationCount = useMemo(() => generateCombinations(paramVariations).length, [paramVariations]);

  // Toggle selection of all datasets with a given timeframe
  const toggleTimeframe = useCallback(
    (timeframe: string) => {
      const filesForTimeframe = availableDatasets
        .filter((ds) => ds.timeframe === timeframe)
        .map((ds) => ds.file);
      const allSelected = filesForTimeframe.every((f) => selectedFiles.includes(f));
      if (allSelected) {
        setSelectedFiles((prev) => prev.filter((f) => !filesForTimeframe.includes(f)));
      } else {
        setSelectedFiles((prev) => [...new Set([...prev, ...filesForTimeframe])]);
      }
    },
    [availableDatasets, selectedFiles]
  );

  // Initialize params when strategy changes - load from localStorage or use defaults
  useEffect(() => {
    const defaults = getDefaultParams(selectedStrategyId);
    const saved = loadStrategySettings(selectedStrategyId);

    // Use saved params if available, falling back to defaults for any missing keys
    if (saved?.currentParams) {
      const merged = { ...defaults };
      for (const key of Object.keys(defaults)) {
        if (key in saved.currentParams) {
          merged[key] = saved.currentParams[key];
        }
      }
      setCurrentParams(merged);
    } else {
      setCurrentParams(defaults);
    }

    // Initialize variation configs from saved or from parameter definitions
    const strategy = AVAILABLE_STRATEGIES[selectedStrategyId];
    if (strategy?.parameters) {
      const defaultVariations = strategy.parameters
        .filter((p) => p.type === 'number')
        .map((p) => ({
          key: p.key,
          min: p.min ?? Number(p.default),
          max: p.max ?? Number(p.default),
          step: p.step ?? 1,
        }));

      if (saved?.paramVariations && saved.paramVariations.length > 0) {
        // Merge saved variations with defaults for any new parameters
        const savedKeys = new Set(saved.paramVariations.map((v) => v.key));
        const merged = [
          ...saved.paramVariations.filter((v) => strategy.parameters!.some((p) => p.key === v.key)),
          ...defaultVariations.filter((v) => !savedKeys.has(v.key)),
        ];
        setParamVariations(merged);
      } else {
        setParamVariations(defaultVariations);
      }
    } else {
      setParamVariations([]);
    }

    // Restore risk management settings for this strategy
    if (saved) {
      setStopLossPercent(saved.stopLossPercent ?? 1);
      setTakeProfitPercent(saved.takeProfitPercent ?? 0);
      setEnableShorts(saved.enableShorts ?? false);
      setPositionSizePercent(saved.positionSizePercent ?? 100);
      setCommissionBps(saved.commissionBps ?? 0);
      setSlippageBps(saved.slippageBps ?? 0);
    } else {
      setStopLossPercent(1);
      setTakeProfitPercent(0);
      setEnableShorts(false);
      setPositionSizePercent(100);
      setCommissionBps(0);
      setSlippageBps(0);
    }
  }, [selectedStrategyId]);

  // Fetch available datasets on mount
  useEffect(() => {
    const saved = loadGlobalSettings();
    if (saved?.selectedStrategyId && AVAILABLE_STRATEGIES[saved.selectedStrategyId]) {
      setSelectedStrategyId(saved.selectedStrategyId);
    }
    if (saved?.selectedStrategyIds && saved.selectedStrategyIds.length > 0) {
      const valid = saved.selectedStrategyIds.filter((id) => AVAILABLE_STRATEGIES[id]);
      if (valid.length > 0) setSelectedStrategyIds(valid);
    } else if (saved?.selectedStrategyId && AVAILABLE_STRATEGIES[saved.selectedStrategyId]) {
      setSelectedStrategyIds([saved.selectedStrategyId]);
    }
    if (saved?.showEquityCurve !== undefined) setShowEquityCurve(saved.showEquityCurve);
    if (saved?.visibleCandles !== undefined) setVisibleCandles(saved.visibleCandles);
  }, []);

  useEffect(() => {
    async function fetchDatasets() {
      try {
        const response = await fetch("/api/data-files");
        const result = await response.json();
        if (result.success && result.files.length > 0) {
          setAvailableDatasets(result.files);
          const savedGlobal = loadGlobalSettings();
          const availableFileNames = result.files.map((f: DatasetInfo) => f.file);
          // Restore saved file selection if valid, otherwise use default
          if (savedGlobal?.selectedFiles && savedGlobal.selectedFiles.length > 0) {
            const validFiles = savedGlobal.selectedFiles.filter((f: string) => availableFileNames.includes(f));
            if (validFiles.length > 0) {
              setSelectedFiles(validFiles);
              return;
            }
          }
          const dailyFile = result.files.find((f: DatasetInfo) => f.timeframe === "1d");
          setSelectedFiles([dailyFile?.file || result.files[0].file]);
        }
      } catch (err) {
        console.error("Error fetching datasets:", err);
      }
    }
    fetchDatasets();
  }, []);

  // Save global settings when any global preference changes
  useEffect(() => {
    saveGlobalSettings({ selectedStrategyId, selectedStrategyIds, selectedFiles, showEquityCurve, visibleCandles });
  }, [selectedStrategyId, selectedStrategyIds, selectedFiles, showEquityCurve, visibleCandles]);

  // Save per-strategy settings when any strategy-specific setting changes
  useEffect(() => {
    if (Object.keys(currentParams).length === 0) return;
    saveStrategySettings(selectedStrategyId, {
      currentParams,
      paramVariations,
      stopLossPercent,
      takeProfitPercent,
      enableShorts,
      positionSizePercent,
      commissionBps,
      slippageBps,
    });
  }, [selectedStrategyId, currentParams, paramVariations, stopLossPercent, takeProfitPercent, enableShorts, positionSizePercent, commissionBps, slippageBps]);

  // Build a StrategyRun for one strategy from saved per-strategy settings,
  // falling back to defaults if it has never been edited.
  const buildSavedRun = useCallback((strategyId: string) => {
    const strat = AVAILABLE_STRATEGIES[strategyId];
    if (!strat) return null;
    const saved = loadStrategySettings(strategyId);
    const defaults = getDefaultParams(strategyId);
    const params = saved?.currentParams ? { ...defaults, ...saved.currentParams } : defaults;

    let variations: ParameterVariationConfig[] = [];
    if (strat.parameters) {
      const numericDefaults = strat.parameters
        .filter((p) => p.type === 'number')
        .map((p) => ({
          key: p.key,
          min: p.min ?? Number(p.default),
          max: p.max ?? Number(p.default),
          step: p.step ?? 1,
        }));
      if (saved?.paramVariations && saved.paramVariations.length > 0) {
        const savedKeys = new Set(saved.paramVariations.map((v) => v.key));
        variations = [
          ...saved.paramVariations.filter((v) => strat.parameters!.some((p) => p.key === v.key)),
          ...numericDefaults.filter((v) => !savedKeys.has(v.key)),
        ];
      } else {
        variations = numericDefaults;
      }
    }

    return {
      strategyId,
      currentParams: params,
      paramVariations: variations,
      stopLossPercent: saved?.stopLossPercent ?? 1,
      takeProfitPercent: saved?.takeProfitPercent ?? 0,
      enableShorts: saved?.enableShorts ?? false,
      positionSizePercent: saved?.positionSizePercent ?? 100,
      commissionBps: saved?.commissionBps ?? 0,
      slippageBps: saved?.slippageBps ?? 0,
    };
  }, []);

  // Run batch backtest with parameter variations against all selected datasets.
  //
  // Compute happens in a Web Worker on the user's machine (see backtest.worker.ts).
  // The worker fetches CSVs via /api/csv and runs the entire indicator + backtest
  // pipeline off the main thread, so the UI stays responsive and we don't hit
  // Vercel's lambda memory/time limits.
  const runBatchBacktest = useCallback(async () => {
    if (selectedFiles.length === 0 || selectedStrategyIds.length === 0) return;
    setIsRunningBatch(true);
    setError(null);
    setResults([]);
    datasetIndicatorCache.current = {};

    // Build per-strategy run configs. Active strategy uses live editor state.
    const perStrategyRuns = selectedStrategyIds
      .map((sid) => {
        if (sid === selectedStrategyId) {
          return {
            strategyId: sid,
            currentParams,
            paramVariations,
            stopLossPercent,
            takeProfitPercent,
            enableShorts,
            positionSizePercent,
            commissionBps,
            slippageBps,
          };
        }
        return buildSavedRun(sid);
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    try {
      const { results: workerResults, indicatorDataByDataset, failedDatasets } =
        await runBacktestWorker(selectedFiles, perStrategyRuns);

      datasetIndicatorCache.current = indicatorDataByDataset;
      setResults(workerResults);
      playDing();
      setActiveResultTab(0);

      const first = workerResults[0];
      if (first?.dataset && indicatorDataByDataset[first.dataset]) {
        setIndicatorData(indicatorDataByDataset[first.dataset]);
      }

      if (failedDatasets.length > 0) {
        setError(`Failed to load ${failedDatasets.length} dataset(s): ${failedDatasets.join("; ")}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Backtest failed";
      if (msg !== "Cancelled") setError(msg);
    } finally {
      setIsRunningBatch(false);
    }
  }, [selectedFiles, selectedStrategyIds, selectedStrategyId, paramVariations, currentParams, stopLossPercent, takeProfitPercent, enableShorts, positionSizePercent, commissionBps, slippageBps, buildSavedRun, runBacktestWorker]);

  // Generate markdown report for clipboard
  const generateMarkdownReport = useCallback(() => {
    const result = results[activeResultTab];
    if (!result) return '';
    // Prefer the strategy this result was actually generated from. Falls back
    // to the active editor when the API did not tag the result (legacy runs).
    const resultStrategyId = result.strategyId ?? selectedStrategyId;
    const strat = AVAILABLE_STRATEGIES[resultStrategyId];
    if (!strat) return '';

    // Risk settings + shorts also depend on which strategy produced this result.
    const isActiveEditorStrategy = resultStrategyId === selectedStrategyId;
    const savedForResult = isActiveEditorStrategy ? null : loadStrategySettings(resultStrategyId);
    const reportSL = isActiveEditorStrategy ? stopLossPercent : (savedForResult?.stopLossPercent ?? 1);
    const reportTP = isActiveEditorStrategy ? takeProfitPercent : (savedForResult?.takeProfitPercent ?? 0);
    const reportShorts = isActiveEditorStrategy ? enableShorts : (savedForResult?.enableShorts ?? false);

    const datasetLabels = selectedFiles.map(f => {
      const ds = availableDatasets.find(d => d.file === f);
      return ds?.label || f;
    });

    const lines: string[] = [
      '# Algo Backtest Report',
      '',
      '## Strategy',
      '',
      `- **Name:** ${strat.name}`,
      `- **Description:** ${strat.description}`,
      '',
      '## Inputs',
      '',
      `- **Dataset(s):** ${datasetLabels.join(', ')}`,
      `- **Active Dataset:** ${result.datasetLabel ?? 'n/a'}`,
      `- **Initial Capital:** $${INITIAL_CAPITAL.toLocaleString()}`,
      `- **Stop Loss:** ${reportSL > 0 ? `${reportSL}%` : 'Disabled'}`,
      `- **Take Profit:** ${reportTP > 0 ? `${reportTP}%` : 'Disabled'}`,
      `- **Short Selling:** ${reportShorts ? 'Enabled' : 'Disabled'}`,
    ];

    if (strat.parameters && strat.parameters.length > 0) {
      lines.push('', '### Strategy Parameters', '');
      lines.push('| Parameter | Value |');
      lines.push('|-----------|-------|');
      for (const param of strat.parameters) {
        const value = result.params[param.key] ?? currentParams[param.key] ?? param.default;
        lines.push(`| ${param.name} | ${value} |`);
      }
    }

    lines.push(
      '',
      '## Results',
      '',
      '| Metric | Value |',
      '|--------|-------|',
      `| Strategy P&L | ${result.totalPnlPercent >= 0 ? '+' : ''}${result.totalPnlPercent.toFixed(2)}% ($${result.totalPnl.toFixed(2)}) |`,
      `| Buy & Hold P&L | ${result.buyAndHoldPnlPercent >= 0 ? '+' : ''}${result.buyAndHoldPnlPercent.toFixed(2)}% ($${result.buyAndHoldPnl.toFixed(2)}) |`,
      `| Alpha vs B&H | ${(result.totalPnlPercent - result.buyAndHoldPnlPercent) >= 0 ? '+' : ''}${(result.totalPnlPercent - result.buyAndHoldPnlPercent).toFixed(2)}% |`,
      `| Total Trades | ${result.totalTrades} |`,
      `| Win Rate | ${result.winRate.toFixed(1)}% (${result.winningTrades}W / ${result.losingTrades}L) |`,
      `| Avg Win | $${result.averageWin.toFixed(2)} |`,
      `| Avg Loss | $${result.averageLoss.toFixed(2)} |`,
      `| Profit Factor | ${result.profitFactor == null ? 'N/A' : result.profitFactor === Infinity ? 'Infinite' : result.profitFactor.toFixed(2)} |`,
      `| Max Drawdown | -${result.maxDrawdownPercent.toFixed(2)}% ($${result.maxDrawdown.toFixed(2)}) |`,
      `| Sharpe Ratio | ${result.sharpeRatio.toFixed(2)} |`,
    );

    if (result.trades.length > 0) {
      lines.push(
        '',
        '## Trade Log',
        '',
        '| # | Side | Entry Time | Entry Price | Exit Time | Exit Price | P&L | P&L % | Reason |',
        '|---|------|-----------|-------------|----------|-----------|-----|-------|--------|',
      );
      for (let i = 0; i < result.trades.length; i++) {
        const t = result.trades[i];
        lines.push(
          `| ${i + 1} | ${t.side} | ${new Date(t.entryTime).toLocaleString()} | $${t.entryPrice.toFixed(2)} | ${new Date(t.exitTime).toLocaleString()} | $${t.exitPrice.toFixed(2)} | ${t.pnl >= 0 ? '+' : ''}$${t.pnl.toFixed(2)} | ${t.pnlPercent >= 0 ? '+' : ''}${t.pnlPercent.toFixed(2)}% | ${t.reason} |`
        );
      }
    }

    return lines.join('\n');
  }, [results, activeResultTab, selectedStrategyId, selectedFiles, availableDatasets, currentParams, stopLossPercent, takeProfitPercent, enableShorts]);

  // Copy report to clipboard
  const copyReport = useCallback(async () => {
    const markdown = generateMarkdownReport();
    if (!markdown) return;
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('Unable to copy to clipboard. Please check your browser permissions.');
    }
  }, [generateMarkdownReport]);

  // Source of the strategy behind the active result, fetched so the Lambda
  // prompt can carry the exact logic rather than a one-line description.
  // Prefetched on result change because Safari drops clipboard permission if
  // the copy has to wait on a network round trip after the click.
  const [strategySource, setStrategySource] = useState<{ id: string; source: string } | null>(null);
  const activeResultStrategyId = results[activeResultTab]?.strategyId ?? selectedStrategyId;
  useEffect(() => {
    if (results.length === 0) return;
    let cancelled = false;
    fetch(`/api/strategy-source?id=${encodeURIComponent(activeResultStrategyId)}`)
      .then((r) => (r.ok ? r.text() : null))
      .then((source) => {
        if (!cancelled && source) setStrategySource({ id: activeResultStrategyId, source: source.replace(/\r\n/g, '\n') });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeResultStrategyId, results.length]);

  // Generate a copy-pasteable prompt that has Claude write a single-file AWS
  // Lambda (pasted into the console's code editor) that paper-trades the
  // active result's strategy through Tradier's sandbox API. Every rule below
  // mirrors what runBacktestWithParams in backtest-engine.ts actually does, so
  // the live version trades the way the backtest did. If the engine changes,
  // change this with it.
  const generateLambdaPrompt = useCallback(() => {
    const result = results[activeResultTab];
    if (!result) return '';
    const resultStrategyId = result.strategyId ?? selectedStrategyId;
    const strat = AVAILABLE_STRATEGIES[resultStrategyId];
    if (!strat) return '';

    const isActiveEditorStrategy = resultStrategyId === selectedStrategyId;
    const savedForResult = isActiveEditorStrategy ? null : loadStrategySettings(resultStrategyId);
    const sl = isActiveEditorStrategy ? stopLossPercent : (savedForResult?.stopLossPercent ?? 1);
    const tp = isActiveEditorStrategy ? takeProfitPercent : (savedForResult?.takeProfitPercent ?? 0);
    const shorts = isActiveEditorStrategy ? enableShorts : (savedForResult?.enableShorts ?? false);
    const posSize = isActiveEditorStrategy ? positionSizePercent : (savedForResult?.positionSizePercent ?? 100);
    const commission = isActiveEditorStrategy ? commissionBps : (savedForResult?.commissionBps ?? 0);
    const slippage = isActiveEditorStrategy ? slippageBps : (savedForResult?.slippageBps ?? 0);

    const resolvedParams = (strat.parameters ?? []).map((param) => ({
      param,
      value: result.params[param.key] ?? currentParams[param.key] ?? param.default,
    }));
    // The engine, not the handler, applies this key to any strategy carrying it.
    const trailingStopEmaPeriod =
      Number(resolvedParams.find((p) => p.param.key === 'trailingStopEmaPeriod')?.value ?? 0) || 0;
    const longestPeriod = Math.max(
      26,
      ...resolvedParams.map(({ value }) => (typeof value === 'number' ? value : 0)),
    );
    const historyBars = Math.max(250, longestPeriod * 5);

    const dataset = availableDatasets.find((d) => d.file === result.dataset);
    const symbol = dataset?.symbol ?? 'UNKNOWN (use the symbol this was backtested against)';
    const timeframe = (dataset?.timeframe ?? 'unknown').toLowerCase();
    const intraday = !['1d', '1wk', 'unknown'].includes(timeframe);
    const tradierBars: Record<string, string> = {
      '1m': '`GET /v1/markets/timesales?interval=1min`',
      '2m': '`GET /v1/markets/timesales?interval=1min`, aggregated into 2-minute bars',
      '5m': '`GET /v1/markets/timesales?interval=5min`',
      '15m': '`GET /v1/markets/timesales?interval=15min`',
      '30m': '`GET /v1/markets/timesales?interval=15min`, aggregated into 30-minute bars',
      '1h': '`GET /v1/markets/timesales?interval=15min`, aggregated into 1-hour bars',
      '1d': '`GET /v1/markets/history?interval=daily`',
      '1wk': '`GET /v1/markets/history?interval=weekly`',
    };
    const source = strategySource?.id === resultStrategyId ? strategySource.source : null;

    const riskExits: string[] = [];
    if (trailingStopEmaPeriod > 0) {
      riskExits.push(
        `**Trailing EMA stop.** On a bar after the entry bar, if a long's close is ≤ EMA${trailingStopEmaPeriod} (a short's close ≥ EMA${trailingStopEmaPeriod}), exit at that close with a market order. This one is close-based, so the Lambda evaluates it itself.`,
      );
    }
    if (sl > 0 || tp > 0) {
      const levels = [
        sl > 0 ? `stop loss ${sl}% against the entry fill (long: fill × ${(1 - sl / 100).toFixed(4)}; short: fill × ${(1 + sl / 100).toFixed(4)})` : null,
        tp > 0 ? `take profit ${tp}% in favor of the entry fill (long: fill × ${(1 + tp / 100).toFixed(4)}; short: fill × ${(1 - tp / 100).toFixed(4)})` : null,
      ].filter(Boolean).join(', and ');
      riskExits.push(
        `**${sl > 0 && tp > 0 ? 'Stop loss and take profit' : sl > 0 ? 'Stop loss' : 'Take profit'}.** Levels: ${levels}, computed from the actual average fill price of the entry order. The backtest checks these intrabar against each bar's high/low, and if a bar opens beyond a level it fills at the open. A Lambda that wakes once per bar can't see intrabar prices, so these must be resting orders at Tradier, placed right after the entry fill is confirmed: ${sl > 0 && tp > 0 ? 'an OCO order (`class=oco`) with a stop leg at the stop level and a limit leg at the target' : sl > 0 ? 'a stop order (`type=stop`) at the stop level' : 'a limit order (`type=limit`) at the target'}, \`duration=gtc\`. Each invocation, check whether it filled; if so, record the exit and clear the position.`,
      );
    }

    const lines: string[] = [
      `# Write an AWS Lambda that paper-trades ${strat.name} on ${symbol} (${timeframe} bars)`,
      '',
      "Write an AWS Lambda function that trades the strategy below through **Tradier's SANDBOX (paper-trading) API only**. It must follow the same rules as the backtest this prompt came from, described exactly below. Wherever something is ambiguous, pick the more conservative reading and say what you chose.",
      '',
      '## What to hand back',
      '',
      "1. **One file, `index.mjs`**, for the **Node.js 22.x** runtime with handler `index.handler`. I will paste it into the AWS Lambda console code editor, so it can't have npm dependencies: use the built-in global `fetch` for Tradier, and only the AWS SDK v3 clients the runtime already bundles (`@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `@aws-sdk/client-secrets-manager`). No build step, no TypeScript.",
      '2. **A setup checklist for the AWS console**: the DynamoDB table (name, partition key), the Secrets Manager secret (name, JSON keys), the environment variables, the IAM permissions, the EventBridge Scheduler schedule, and the function timeout and memory.',
      "3. **A short test plan**: how to run it once by hand from the console's Test tab and what the log should show.",
      '',
      '## Hard guardrails',
      '',
      "- Base URL is `https://sandbox.tradier.com/v1`. Hardcode it as a constant and throw at startup if it doesn't contain `sandbox.tradier.com`. No environment variable can point this at live trading.",
      '- Read the sandbox access token and paper account id from Secrets Manager (cache them across warm invocations), never from code or plain environment variables.',
      '- Never trade on missing, stale, or incomplete data. When in doubt, do nothing and log why.',
      '',
      '## Strategy',
      '',
      `- **Name:** ${strat.name} (\`${strat.id}\`)`,
      `- **Summary:** ${strat.description}`,
      `- **Symbol:** ${symbol}`,
      `- **Bar interval:** ${timeframe}`,
      `- **Direction:** ${shorts ? 'long and short' : "long only. A 'sell' signal while flat does nothing."}`,
    ];

    if (resolvedParams.length > 0) {
      lines.push('', '### Parameters (use these exact values)', '', '| Key | Value | Meaning |', '|---|---|---|');
      for (const { param, value } of resolvedParams) {
        lines.push(`| \`${param.key}\` | **${value}** | ${param.description} |`);
      }
    }

    lines.push('', '### Signal logic (port this exactly)', '');
    if (source) {
      lines.push(
        "This is the strategy's TypeScript source from the backtester. Port `handler` to plain JavaScript without changing its behavior. It gets `{ current, previous, index, series, params }`: `series` is every bar oldest to newest with the indicator fields below attached, `current = series[index]`, `previous = series[index - 1]`, and it returns `{ action: \"buy\" | \"sell\" | \"hold\", reason }`. Evaluate it once per invocation, on the most recent **completed** bar.",
        '',
        '```ts',
        source.trimEnd(),
        '```',
      );
    } else {
      lines.push(`The strategy source couldn't be loaded, so work from the summary: ${strat.description}. Tell me you did that.`);
    }

    lines.push(
      '',
      '### Indicator fields the strategy reads',
      '',
      'Compute these over the whole fetched history, oldest bar first. Recursive indicators (EMA, RSI, ATR, MACD) depend on where the history starts, so always fetch the same generous window (see Market data).',
      '',
      '- `sma{n}`: mean of the last n closes, including the current bar.',
      '- `ema{n}`: undefined for the first n−1 bars. At bar n−1 it is the SMA of the first n closes; after that, `ema = (close − prev) × 2/(n+1) + prev`. Provide `ema{n}` for every EMA period the strategy asks for, plus `ema9` and `ema21`.',
      '- `rsi`: 14-period Wilder RSI. Take the simple average of the first 14 close-to-close gains and losses, then smooth with `avg = (avg × 13 + x) / 14`. `rsi = 100 − 100/(1 + avgGain/avgLoss)`, and when `avgLoss` is 0 treat the ratio as 100.',
      '- `atr`: 14-period Wilder ATR. `TR = max(high − low, |high − prevClose|, |low − prevClose|)`, seeded with the mean of the first 14 TRs, then `(atr × 13 + TR) / 14`.',
      '- `macd_{f}_{s}_{g}`, `macdSignal_{f}_{s}_{g}`, `macdHistogram_{f}_{s}_{g}`: MACD line = EMA_f − EMA_s (both seeded as above). The signal line is an EMA_g of the MACD line, seeded with the first MACD value. Histogram = MACD − signal. The 12/26/9 set is also exposed as `macd`, `macdSignal`, and `macdHistogram`.',
      '- `donchian_{n}_upperBand` / `_lowerBand` / `_midLine`: highest high and lowest low of the last n bars including the current one, and their midpoint. The 20-bar set is also exposed as `upperBand`, `lowerBand`, and `midLine`.',
      "- `prevClose`, `prevHigh`, `prevLow`: the previous bar's values.",
    );

    lines.push(
      '',
      '## Execution rules (these mirror the backtest engine exactly)',
      '',
      'Each invocation handles the newest completed bar, in this order:',
      '',
    );
    const steps: string[] = [...riskExits];
    steps.push(
      `**Strategy signal.** Run the handler. A 'sell' while long ${shorts ? "(or a 'buy' while short) " : ''}closes the position with a market order at the bar close${sl > 0 || tp > 0 ? ', after first cancelling the resting exit order and confirming the cancel' : ''}. Closing does **not** reverse: a new position can only open on a later bar.`,
      `**Entry.** Only when flat, and only if no exit happened on this same bar: 'buy' opens a long${shorts ? ", and 'sell' opens a short (`side=sell_short`, closed later with `side=buy_to_cover`)" : ''}. Send a market order right after the bar closes. The backtest filled entries and exits at the signal bar's close, so the live fill will usually be a little worse.`,
    );
    steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));

    lines.push(
      '',
      '## Risk management',
      '',
      `- **Position size:** ${posSize}% of account equity per new position, where equity is the Tradier paper account's \`total_equity\` from \`GET /v1/accounts/{id}/balances\`. Shares = floor(equity × ${posSize / 100} ÷ last close). If that comes to 0, skip the trade and log it. The share count stays fixed until exit; never add to or trim an open position.`,
      '- **One position at a time** in this symbol. Ignore entry signals while a position is open, and ignore them while an entry or exit order is still pending.',
      `- **Stop loss:** ${sl > 0 ? `${sl}%, as a resting order (see Execution rules).` : 'none. The backtest ran without one.'}`,
      `- **Take profit:** ${tp > 0 ? `${tp}%, as a resting order (see Execution rules).` : 'none. The backtest ran without one.'}`,
      `- **Trailing stop:** ${trailingStopEmaPeriod > 0 ? `close-based, EMA${trailingStopEmaPeriod} (see Execution rules).` : 'none.'}`,
      "- **Max daily loss:** not part of the backtest, so it has no backtested value. Add it as an environment variable, `MAX_DAILY_LOSS_PCT` (default 2). Track realized P&L per trading day (US/Eastern) in DynamoDB, and once the loss reaches that % of the day's starting equity, stop opening new positions for the rest of the day. Exits keep working.",
      `- **Costs the backtest assumed:** ${commission} bps commission and ${slippage} bps slippage per fill. Nothing to send to Tradier; this is here so live results can be compared fairly.`,
    );

    lines.push(
      '',
      '## Market data',
      '',
      `- Bars: ${tradierBars[timeframe] ?? 'whichever Tradier endpoint matches the bar interval'}. Fetch at least the last ${historyBars} bars on every invocation so the indicators have warmed up.`,
      intraday
        ? '- The backtest data **includes pre-market and after-hours bars**, so use `session_filter=all` to match. Only place orders during regular hours (9:30am–4:00pm ET), because market orders are regular-session only. Outside regular hours, still evaluate the signal and log what you would have done.'
        : '- Use only completed bars. Run after the close so the most recent daily or weekly bar is final.',
      '- Drop the bar that is still forming. If the newest completed bar is older than one interval (plus a small grace period), treat the data as stale and do nothing.',
      intraday
        ? '- Build bars in UTC epoch milliseconds, oldest first. Timesales returns timestamps in US/Eastern, so convert them.'
        : '- Build bars in UTC epoch milliseconds, oldest first.',
    );

    lines.push(
      '',
      '## Orders and state',
      '',
      '- Place orders with `POST /v1/accounts/{id}/orders`, form-encoded, `class=equity` (or `class=oco` for the bracket), with the market orders `duration=day`. Only update state after `GET /v1/accounts/{id}/orders/{orderId}` shows `status=filled`, and use its `avg_fill_price` as the entry price that stop and target levels are computed from.',
      "- If an order is still open or partially filled at the next invocation, keep waiting: don't place another. If it was rejected or cancelled, log it and go back to flat.",
      '- **DynamoDB**, one item keyed by `symbol#strategyId`: `position` (side, shares, entryPrice, entryTime, stopLevel, targetLevel, exitOrderId), `pendingOrderId`, `lastProcessedBarTime` (so a retried or duplicate invocation never acts on the same bar twice), `tradingDay`, `dayStartEquity`, `realizedPnlToday`.',
      '- On every invocation, reconcile against Tradier (`GET /v1/accounts/{id}/positions` and open orders) before doing anything. If they disagree with DynamoDB, trust Tradier, log the mismatch loudly, and skip trading on this invocation.',
    );

    lines.push(
      '',
      '## Scheduling, logging, errors',
      '',
      intraday
        ? `- **EventBridge Scheduler:** a cron expression in the \`America/New_York\` timezone that fires a few seconds after each ${timeframe} bar closes on weekdays. Make it cover the full session the data uses, and let the code decide whether orders are allowed.`
        : `- **EventBridge Scheduler:** \`cron(15 16 ? * MON-FRI *)\` in the \`America/New_York\` timezone (4:15pm ET, after the close)${timeframe === '1wk' ? ', with the code acting only on the last trading day of the week' : ''}.`,
      '- Write one JSON log line per invocation: bar time, OHLC, the indicator values the handler read, the signal and its reason, the action taken (or why none), orders placed, and the resulting state.',
      '- Retry Tradier calls with backoff on network errors and 5xx responses only, at most 3 attempts. Never retry a 4xx.',
      '- Wrap the whole handler in a try/catch. Log the error and rethrow so the invocation shows as failed, and never leave state half-written: write DynamoDB once, at the end, with a conditional update on `lastProcessedBarTime`.',
      '',
      '---',
      '',
      `*Backtest this came from (for comparison, not to enforce): ${result.datasetLabel ?? dataset?.label ?? 'n/a'}, ${result.totalPnlPercent >= 0 ? '+' : ''}${result.totalPnlPercent.toFixed(2)}% over ${result.totalTrades} trades, ${result.winRate.toFixed(1)}% win rate, ${result.maxDrawdownPercent.toFixed(2)}% max drawdown, Sharpe ${result.sharpeRatio.toFixed(2)}, starting from $${INITIAL_CAPITAL.toLocaleString()}.*`,
    );

    return lines.join('\n');
  }, [
    results,
    activeResultTab,
    selectedStrategyId,
    currentParams,
    stopLossPercent,
    takeProfitPercent,
    enableShorts,
    positionSizePercent,
    commissionBps,
    slippageBps,
    availableDatasets,
    strategySource,
  ]);

  // Copy the Lambda deployment prompt to clipboard
  const copyLambdaPrompt = useCallback(async () => {
    const prompt = generateLambdaPrompt();
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setLambdaPromptCopied(true);
      setTimeout(() => setLambdaPromptCopied(false), 2000);
    } catch {
      alert('Unable to copy to clipboard. Please check your browser permissions.');
    }
  }, [generateLambdaPrompt]);

  // Backtest only runs on explicit button click ("Run N Variations") — no auto-run on file or param change.

  // Update chart data when switching between result tabs with different datasets
  useEffect(() => {
    const activeResult = results[activeResultTab];
    if (activeResult?.dataset && datasetIndicatorCache.current[activeResult.dataset]) {
      setIndicatorData(datasetIndicatorCache.current[activeResult.dataset]);
    }
  }, [activeResultTab, results]);

  const activeResult = results[activeResultTab];

  const chartTrades = useMemo(
    () =>
      activeResult?.trades.map((t) => ({
        ...t,
        side: t.side === "LONG" ? PositionSide.LONG : PositionSide.SHORT,
      })) ?? [],
    [activeResult]
  );

  return (
    <BentoPageLayout title='Algo Backtest'>
            {error ? (
              <div className='flex-1 flex items-center justify-center text-red-500 p-8'>
                <div className='text-center'>
                  <div className='text-xl mb-2 font-semibold'>Error</div>
                  <div className='text-gray-600'>{error}</div>
                </div>
              </div>
            ) : isRunningBatch ? (
              <BacktestProgressPanel
                progress={backtestProgress}
                datasetLabel={(file) => availableDatasets.find((d) => d.file === file)?.label ?? file}
                onCancel={() => {
                  cancelBacktest();
                  setIsRunningBatch(false);
                }}
              />
            ) : (
              <div className='flex flex-col min-w-0'>

                {/* ── Configuration (top) ─────────────────────────────── */}
                <div className='shrink-0 border-b border-gray-200 px-4 py-3'>
                  <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3'>

                    {/* Data */}
                    <div className='flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50/60 p-3'>
                      <div className='flex items-center justify-between'>
                        <span className='text-[10px] font-semibold uppercase tracking-wide text-gray-600'>Data</span>
                        <div className='flex items-center gap-1.5'>
                          <button
                            onClick={() => setSelectedFiles(availableDatasets.map((ds) => ds.file))}
                            className='text-xs text-blue-600 hover:text-blue-700 transition-colors'
                          >
                            All
                          </button>
                          <button
                            onClick={() => setSelectedFiles([])}
                            disabled={selectedFiles.length === 0}
                            className='text-xs text-gray-600 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors'
                          >
                            None
                          </button>
                          <span className='text-xs text-gray-600'>{selectedFiles.length} sel</span>
                        </div>
                      </div>
                      <input
                        type='text'
                        value={datasetSearch}
                        onChange={(e) => setDatasetSearch(e.target.value)}
                        placeholder='Search ticker…'
                        className='w-full bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500'
                      />
                      {uniqueTimeframes.length > 1 && (
                        <div className='flex flex-wrap gap-1'>
                          {uniqueTimeframes.map((tf) => {
                            const filesForTf = availableDatasets
                              .filter((ds) => ds.timeframe === tf)
                              .map((ds) => ds.file);
                            const allSelected = filesForTf.every((f) => selectedFiles.includes(f));
                            return (
                              <button
                                key={tf}
                                onClick={() => toggleTimeframe(tf)}
                                className={`px-1.5 py-0.5 text-[10px] rounded border transition-colors ${
                                  allSelected
                                    ? 'bg-blue-600 border-blue-500 text-white'
                                    : 'bg-white border-gray-300 text-gray-600 hover:border-blue-400 hover:text-blue-600'
                                }`}
                              >
                                {tf.toUpperCase()}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <div className='max-h-40 overflow-y-auto bg-white border border-gray-200 rounded p-1 space-y-0.5'>
                        {availableDatasets
                          .filter((ds) =>
                            ds.symbol.toLowerCase().includes(datasetSearch.toLowerCase())
                          )
                          .map((ds) => (
                            <label
                              key={ds.file}
                              className='flex items-center gap-1.5 px-1.5 py-0.5 hover:bg-gray-50 rounded cursor-pointer'
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
                                className='rounded border-gray-300 text-blue-500'
                              />
                              <span className='text-xs text-gray-900'>{ds.label}</span>
                            </label>
                          ))}
                      </div>
                      {selectedFiles.length === 0 && (
                        <p className='text-xs text-amber-600'>Select at least one</p>
                      )}
                    </div>

                    {/* Strategy */}
                    <div className='flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50/60 p-3'>
                      <div className='flex items-center justify-between'>
                        <span className='text-[10px] font-semibold uppercase tracking-wide text-gray-600'>Strategy</span>
                        <div className='flex items-center gap-1.5'>
                          <button
                            onClick={() => {
                              const allIds = Object.keys(AVAILABLE_STRATEGIES);
                              if (selectedStrategyIds.length === allIds.length) {
                                setSelectedStrategyIds([selectedStrategyId]);
                              } else {
                                setSelectedStrategyIds(allIds);
                              }
                            }}
                            className='text-xs text-blue-600 hover:text-blue-700 transition-colors'
                          >
                            {selectedStrategyIds.length === Object.keys(AVAILABLE_STRATEGIES).length ? 'Clear' : 'All'}
                          </button>
                          <span className='text-xs text-gray-600'>{selectedStrategyIds.length} sel</span>
                        </div>
                      </div>
                      <div className='flex flex-col gap-0.5 max-h-56 overflow-y-auto bg-white border border-gray-200 rounded p-1'>
                        {Object.values(AVAILABLE_STRATEGIES).map((s) => {
                          const isChecked = selectedStrategyIds.includes(s.id);
                          const isActive = s.id === selectedStrategyId;
                          const isExpanded = expandedStrategyIds.includes(s.id);
                          const numericParams = s.parameters?.filter((p) => p.type === 'number') ?? [];
                          const hasParams = numericParams.length > 0;
                          const savedRun = mounted && !isActive ? buildSavedRun(s.id) : null;

                          const toggleExpand = () => {
                            setExpandedStrategyIds((prev) =>
                              prev.includes(s.id) ? prev.filter((id) => id !== s.id) : [...prev, s.id]
                            );
                            setSelectedStrategyId(s.id);
                          };

                          return (
                            <div key={s.id} className='rounded'>
                              <div
                                className={`flex items-center gap-1.5 py-1.5 px-2 text-sm rounded ${
                                  isChecked ? 'bg-blue-50' : 'hover:bg-gray-50'
                                }`}
                              >
                                <input
                                  type='checkbox'
                                  checked={isChecked}
                                  onChange={(e) => {
                                    setSelectedStrategyIds((prev) => {
                                      if (e.target.checked)
                                        return prev.includes(s.id) ? prev : [...prev, s.id];
                                      const next = prev.filter((id) => id !== s.id);
                                      if (s.id === selectedStrategyId && next.length > 0) {
                                        setSelectedStrategyId(next[0]);
                                      }
                                      return next.length > 0 ? next : prev;
                                    });
                                  }}
                                  className='rounded border-gray-300 text-blue-500'
                                />
                                <span
                                  className={`flex-1 ${hasParams ? 'cursor-pointer' : ''} ${isActive ? 'text-blue-700 font-medium' : 'text-gray-900'}`}
                                  onClick={() => {
                                    if (hasParams) toggleExpand();
                                  }}
                                >
                                  {s.name}
                                </span>
                                {hasParams && (
                                  <button
                                    onClick={toggleExpand}
                                    className='text-gray-600 px-1'
                                    title={isExpanded ? 'Collapse settings' : 'Expand settings'}
                                  >
                                    <span className={`inline-block transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▾</span>
                                  </button>
                                )}
                              </div>

                              {isExpanded && hasParams && (
                                <div className='bg-gray-50 border-l-2 border-gray-200 ml-4 pl-3 py-2'>
                                  {isActive ? (
                                    <div className='flex flex-wrap gap-3'>
                                      {numericParams.map((param) => {
                                        const variation = paramVariations.find((v) => v.key === param.key);
                                        return (
                                          <div key={param.key} className='flex flex-col gap-1'>
                                            <span className='text-xs text-gray-700 font-medium'>{param.name}</span>
                                            <div className='flex gap-1 items-center'>
                                              <div>
                                                <label className='block text-[10px] text-gray-600 mb-0.5'>Min</label>
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
                                                  className='w-20 bg-white border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900'
                                                />
                                              </div>
                                              <span className='text-gray-600 text-xs self-end pb-2'>→</span>
                                              <div>
                                                <label className='block text-[10px] text-gray-600 mb-0.5'>Max</label>
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
                                                  className='w-20 bg-white border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900'
                                                />
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <div className='flex flex-wrap items-end gap-3'>
                                      {numericParams.map((param) => {
                                        const variation = savedRun?.paramVariations.find((v) => v.key === param.key);
                                        const min = variation?.min ?? param.min ?? Number(param.default);
                                        const max = variation?.max ?? param.max ?? Number(param.default);
                                        const isRange = min !== max;
                                        return (
                                          <div key={param.key} className='flex flex-col gap-1'>
                                            <span className='text-xs text-gray-700 font-medium'>{param.name}</span>
                                            <span className='text-xs font-mono text-gray-600'>
                                              {isRange ? `${min} → ${max}` : String(min)}
                                            </span>
                                          </div>
                                        );
                                      })}
                                      <button
                                        onClick={() => setSelectedStrategyId(s.id)}
                                        className='text-[10px] text-blue-600 hover:text-blue-700'
                                      >
                                        Edit →
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Risk */}
                    <div className='flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50/60 p-3'>
                      <span className='text-[10px] font-semibold uppercase tracking-wide text-gray-600'>Risk</span>
                      <div className='flex flex-wrap gap-2'>
                        <div className='flex flex-col gap-1 flex-1 min-w-[90px]'>
                          <label className='text-xs text-gray-600'>Stop Loss %</label>
                          <input
                            type='number'
                            value={stopLossPercent}
                            min={0}
                            step={0.5}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              setStopLossPercent(isNaN(v) ? 0 : Math.max(0, v));
                            }}
                            placeholder='0 = off'
                            className='w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900'
                          />
                        </div>

                        <div className='flex flex-col gap-1 flex-1 min-w-[90px]'>
                          <label className='text-xs text-gray-600'>Take Profit %</label>
                          <input
                            type='number'
                            value={takeProfitPercent}
                            min={0}
                            step={0.5}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              setTakeProfitPercent(isNaN(v) ? 0 : Math.max(0, v));
                            }}
                            placeholder='0 = off'
                            className='w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900'
                          />
                        </div>

                        <div className='flex flex-col gap-1 flex-1 min-w-[90px]'>
                          <label className='text-xs text-gray-600'>Position Size %</label>
                          <input
                            type='number'
                            value={positionSizePercent}
                            min={0}
                            max={100}
                            step={1}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              setPositionSizePercent(isNaN(v) ? 100 : Math.max(0, Math.min(100, v)));
                            }}
                            className='w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900'
                          />
                        </div>
                      </div>
                    </div>

                    {/* Execution */}
                    <div className='flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50/60 p-3'>
                      <span className='text-[10px] font-semibold uppercase tracking-wide text-gray-600'>Execution</span>
                      <div className='flex flex-wrap gap-2 items-end'>
                        <div className='flex flex-col gap-1 flex-1 min-w-[90px]'>
                          <label className='text-xs text-gray-600'>Commission (bps)</label>
                          <input
                            type='number'
                            value={commissionBps}
                            min={0}
                            step={0.5}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              setCommissionBps(isNaN(v) ? 0 : Math.max(0, v));
                            }}
                            placeholder='per fill'
                            className='w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900'
                          />
                        </div>

                        <div className='flex flex-col gap-1 flex-1 min-w-[90px]'>
                          <label className='text-xs text-gray-600'>Slippage (bps)</label>
                          <input
                            type='number'
                            value={slippageBps}
                            min={0}
                            step={0.5}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              setSlippageBps(isNaN(v) ? 0 : Math.max(0, v));
                            }}
                            placeholder='per fill'
                            className='w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900'
                          />
                        </div>

                        <div className='flex flex-col justify-end pb-1.5'>
                          <label className='flex items-center gap-2 cursor-pointer'>
                            <input
                              type='checkbox'
                              checked={enableShorts}
                              onChange={(e) => setEnableShorts(e.target.checked)}
                              className='w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500 focus:ring-offset-0'
                            />
                            <span className='text-xs text-gray-600'>Enable Shorts</span>
                          </label>
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* Run Button */}
                  <div className='mt-3 flex justify-end'>
                    <button
                      onClick={runBatchBacktest}
                      disabled={isRunningBatch || selectedFiles.length === 0 || selectedStrategyIds.length === 0}
                      className='w-full sm:w-auto bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-8 rounded-lg transition-colors whitespace-nowrap text-sm shadow-sm'
                    >
                      {isRunningBatch
                        ? backtestProgress
                          ? `Running ${backtestProgress.completed.toLocaleString()}/${backtestProgress.total ? backtestProgress.total.toLocaleString() : "…"}…`
                          : "Running..."
                        : !mounted
                        ? `Run ${combinationCount * selectedFiles.length} Variations`
                        : (() => {
                            let totalRuns = combinationCount;
                            for (const sid of selectedStrategyIds) {
                              if (sid === selectedStrategyId) continue;
                              const saved = buildSavedRun(sid);
                              if (!saved) continue;
                              totalRuns += generateCombinations(saved.paramVariations).length;
                            }
                            const totalRunsAcrossDatasets = totalRuns * selectedFiles.length;
                            const stratLabel = selectedStrategyIds.length > 1
                              ? ` across ${selectedStrategyIds.length} strategies`
                              : '';
                            return `Run ${totalRunsAcrossDatasets} Variations${stratLabel}`;
                          })()}
                    </button>
                  </div>
                </div>

                {/* ── Results (bottom) ────────────────────────────────── */}
                {results.length === 0 && (
                  <div className='flex items-center justify-center py-16'>
                    <p className='text-sm text-gray-600'>Run a backtest to see results</p>
                  </div>
                )}
                {results.length > 0 && <div className='flex flex-col min-w-0'>

                  {/* Tabs for Multiple Results */}
                  {results.length > 1 && (
                    <div className='flex border-b border-gray-200 bg-gray-50 overflow-x-auto shrink-0'>
                      {results.slice(0, 10).map((result, idx) => {
                        const uniqueStrategies = new Set(results.map((r) => r.strategyId).filter(Boolean));
                        const showStrategy = uniqueStrategies.size > 1 && result.strategyName;
                        return (
                          <button
                            key={idx}
                            onClick={() => setActiveResultTab(idx)}
                            title={`${result.strategyName ?? ''} ${result.datasetLabel ?? ''} ${result.label}`.trim()}
                            className={`px-4 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                              activeResultTab === idx
                                ? "border-blue-500 text-blue-600 bg-white"
                                : "border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                            }`}
                          >
                            #{idx + 1}{" "}
                            {showStrategy && (
                              <span className='text-purple-600 mr-1'>{result.strategyName}</span>
                            )}
                            <span className={result.totalPnlPercent >= 0 ? "text-green-600" : "text-red-500"}>
                              {result.totalPnlPercent >= 0 ? "+" : ""}
                              {result.totalPnlPercent.toFixed(1)}%
                            </span>
                          </button>
                        );
                      })}
                      {results.length > 10 && (
                        <span className='px-4 py-2 text-xs text-gray-600'>+{results.length - 10} more</span>
                      )}
                    </div>
                  )}

                  {/* Active Result Label */}
                  {activeResult && results.length > 1 && (
                    <div className='px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs shrink-0'>
                      {activeResult.strategyName && (
                        <>
                          <span className='text-gray-600'>Strategy: </span>
                          <span className='text-purple-600 mr-3 font-medium'>{activeResult.strategyName}</span>
                        </>
                      )}
                      {activeResult.datasetLabel && (
                        <>
                          <span className='text-gray-600'>Dataset: </span>
                          <span className='text-blue-600 mr-3'>{activeResult.datasetLabel}</span>
                        </>
                      )}
                      <span className='text-gray-600'>Parameters: </span>
                      <span className='font-mono text-blue-600'>{activeResult.label}</span>
                    </div>
                  )}

                  {/* Stats Panel */}
                  {activeResult && (
                    <div className='p-4 border-b border-gray-200 bg-gray-50 shrink-0'>
                      <div className='grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2 sm:gap-4 text-sm'>
                        <div className='bg-white border border-gray-200 rounded p-2 sm:p-3 min-w-0'>
                          <div className='text-gray-600 text-xs mb-1'>Strategy P&L</div>
                          <div
                            className={`text-lg font-bold ${activeResult.totalPnlPercent >= 0 ? "text-green-600" : "text-red-500"}`}
                          >
                            {activeResult.totalPnlPercent >= 0 ? "+" : ""}{activeResult.totalPnlPercent.toFixed(2)}%
                          </div>
                        </div>
                        <div className='bg-white border border-gray-200 rounded p-2 sm:p-3 min-w-0'>
                          <div className='text-gray-600 text-xs mb-1'>Buy & Hold</div>
                          <div
                            className={`text-lg font-bold ${activeResult.buyAndHoldPnlPercent >= 0 ? "text-green-600" : "text-red-500"}`}
                          >
                            {activeResult.buyAndHoldPnlPercent >= 0 ? "+" : ""}{activeResult.buyAndHoldPnlPercent.toFixed(2)}%
                          </div>
                        </div>
                        <div className='bg-white border border-gray-200 rounded p-2 sm:p-3 min-w-0'>
                          <div className='text-gray-600 text-xs mb-1'>Win Rate</div>
                          <div className='text-lg font-bold text-gray-900'>
                            {activeResult.winRate.toFixed(1)}%
                            <span className='text-sm text-gray-600 ml-1'>
                              ({activeResult.winningTrades}W / {activeResult.losingTrades}L)
                            </span>
                          </div>
                        </div>
                        <div className='bg-white border border-gray-200 rounded p-2 sm:p-3 min-w-0'>
                          <div className='text-gray-600 text-xs mb-1'>Profit Factor</div>
                          <div
                            className={`text-lg font-bold ${(activeResult.profitFactor ?? 0) >= 1 ? "text-green-600" : "text-red-500"}`}
                          >
                            {activeResult.profitFactor == null ? "N/A" : activeResult.profitFactor === Infinity ? "∞" : activeResult.profitFactor.toFixed(2)}
                          </div>
                        </div>
                        <div className='bg-white border border-gray-200 rounded p-2 sm:p-3 min-w-0'>
                          <div className='text-gray-600 text-xs mb-1'>Max Drawdown</div>
                          <div className='text-lg font-bold text-red-500'>
                            -{activeResult.maxDrawdownPercent.toFixed(2)}%
                          </div>
                        </div>
                        <div className='bg-white border border-gray-200 rounded p-2 sm:p-3 min-w-0'>
                          <div className='text-gray-600 text-xs mb-1'>Sharpe Ratio</div>
                          <div
                            className={`text-lg font-bold ${activeResult.sharpeRatio >= 1 ? "text-green-600" : activeResult.sharpeRatio >= 0 ? "text-gray-700" : "text-red-500"}`}
                          >
                            {activeResult.sharpeRatio.toFixed(2)}
                          </div>
                        </div>
                      </div>

                      {/* Secondary stats */}
                      <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-sm mt-2'>
                        <div className='flex flex-wrap items-center gap-x-4 gap-y-1'>
                          <div className='whitespace-nowrap'>
                            <span className='text-gray-600 text-xs'>Trades:</span>
                            <span className='ml-1 text-gray-900'>{activeResult.totalTrades}</span>
                          </div>
                          <div className='whitespace-nowrap'>
                            <span className='text-gray-600 text-xs'>Avg Win:</span>
                            <span className='ml-1 text-green-600'>${activeResult.averageWin.toFixed(2)}</span>
                          </div>
                          <div className='whitespace-nowrap'>
                            <span className='text-gray-600 text-xs'>Avg Loss:</span>
                            <span className='ml-1 text-red-500'>-${activeResult.averageLoss.toFixed(2)}</span>
                          </div>
                          <div className='whitespace-nowrap'>
                            <span className='text-gray-600 text-xs'>Alpha vs B&H:</span>
                            <span
                              className={`ml-1 font-bold ${activeResult.totalPnlPercent - activeResult.buyAndHoldPnlPercent >= 0 ? "text-green-600" : "text-red-500"}`}
                            >
                              {activeResult.totalPnlPercent - activeResult.buyAndHoldPnlPercent >= 0 ? "+" : ""}
                              {(activeResult.totalPnlPercent - activeResult.buyAndHoldPnlPercent).toFixed(2)}%
                            </span>
                          </div>
                        </div>
                        <div className='flex items-center gap-3'>
                          <label className='text-gray-600 text-xs cursor-pointer'>
                            <input
                              type='checkbox'
                              checked={showEquityCurve}
                              onChange={(e) => setShowEquityCurve(e.target.checked)}
                              className='mr-1'
                            />
                            Equity Curve
                          </label>
                          <button
                            onClick={copyReport}
                            className='flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded transition-colors'
                            title='Copy backtest report as markdown for LLM review'
                          >
                            {copied ? (
                              <>
                                <svg className='w-3.5 h-3.5 text-green-600' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                                  <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M5 13l4 4L19 7' />
                                </svg>
                                <span className='text-green-600'>Copied!</span>
                              </>
                            ) : (
                              <>
                                <svg className='w-3.5 h-3.5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                                  <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3' />
                                </svg>
                                Copy Report
                              </>
                            )}
                          </button>
                          <button
                            onClick={copyLambdaPrompt}
                            className='flex items-center gap-1.5 px-3 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-700 text-xs font-medium rounded transition-colors'
                            title='Copy a spec prompt for an AWS Lambda that paper-trades this strategy via Tradier sandbox'
                          >
                            {lambdaPromptCopied ? (
                              <>
                                <svg className='w-3.5 h-3.5 text-green-600' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                                  <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M5 13l4 4L19 7' />
                                </svg>
                                <span className='text-green-600'>Copied!</span>
                              </>
                            ) : (
                              <>
                                <svg className='w-3.5 h-3.5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                                  <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M13 10V3L4 14h7v7l9-11h-7z' />
                                </svg>
                                Copy Lambda Prompt
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Charts Container */}
                  <div className='flex flex-col shrink-0'>
                    {/* Price Chart */}
                    <div className='h-[420px] sm:h-[640px]'>
                      <BacktestChart
                        data={indicatorData}
                        trades={chartTrades}
                        visibleCandles={visibleCandles}
                        onVisibleCandlesChange={setVisibleCandles}
                        selectedStrategyId={activeResult?.strategyId ?? selectedStrategyId}
                        currentParams={activeResult?.params ?? currentParams}
                        selectedTradeId={selectedTradeId}
                      />
                    </div>

                    {/* Equity Curve Chart */}
                    {showEquityCurve && activeResult && (
                      <div className='h-48 border-t border-gray-200'>
                        <EquityCurveChart
                          equityCurve={activeResult.equityCurve}
                          initialCapital={INITIAL_CAPITAL}
                        />
                      </div>
                    )}
                  </div>

                  {/* Trade Log */}
                  {activeResult && activeResult.trades.length > 0 && (
                    <div className='h-96 border-t border-gray-200 overflow-hidden flex flex-col shrink-0'>
                      <div className='px-4 py-2 bg-gray-50 text-sm font-semibold text-gray-900 border-b border-gray-200'>
                        Trade Log ({activeResult.trades.length} trades)
                      </div>
                      <div className='flex-1 overflow-auto'>
                        <table className='w-full min-w-[760px] text-xs'>
                          <thead className='bg-gray-50 sticky top-0'>
                            <tr className='text-gray-600'>
                              <th className='px-3 py-2 text-left'>Side</th>
                              <th className='px-3 py-2 text-left'>Entry Time</th>
                              <th className='px-3 py-2 text-right'>Entry Price</th>
                              <th className='px-3 py-2 text-left'>Exit Time</th>
                              <th className='px-3 py-2 text-right'>Exit Price</th>
                              <th className='px-3 py-2 text-right'>P&amp;L</th>
                              <th className='px-3 py-2 text-right'>P&amp;L %</th>
                              <th className='px-3 py-2 text-left'>Reason</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activeResult.trades.map((trade) => (
                              <tr
                                key={trade.id}
                                className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${selectedTradeId === trade.id ? 'bg-blue-50 ring-1 ring-blue-400' : ''}`}
                                onClick={() => setSelectedTradeId(selectedTradeId === trade.id ? null : trade.id)}
                              >
                                <td
                                  className={`px-3 py-2 font-semibold ${trade.side === "LONG" ? "text-green-600" : "text-red-500"}`}
                                >
                                  {trade.side}
                                </td>
                                <td className='px-3 py-2 text-gray-700'>{new Date(trade.entryTime).toLocaleString()}</td>
                                <td className='px-3 py-2 text-right text-gray-700'>${trade.entryPrice.toFixed(2)}</td>
                                <td className='px-3 py-2 text-gray-700'>{new Date(trade.exitTime).toLocaleString()}</td>
                                <td className='px-3 py-2 text-right text-gray-700'>${trade.exitPrice.toFixed(2)}</td>
                                <td
                                  className={`px-3 py-2 text-right font-mono ${trade.pnl >= 0 ? "text-green-600" : "text-red-500"}`}
                                >
                                  {trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)}
                                </td>
                                <td
                                  className={`px-3 py-2 text-right font-mono ${trade.pnlPercent >= 0 ? "text-green-600" : "text-red-500"}`}
                                >
                                  {trade.pnlPercent >= 0 ? "+" : ""}
                                  {trade.pnlPercent.toFixed(2)}%
                                </td>
                                <td className='px-3 py-2 text-gray-600 truncate max-w-[200px]' title={trade.reason}>
                                  {trade.reason}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>}
              </div>
            )}

    </BentoPageLayout>
  );
}
