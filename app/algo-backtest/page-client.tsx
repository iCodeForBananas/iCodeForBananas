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

  // Generate a copy-pasteable spec for an AWS Lambda that paper-trades the
  // active result's strategy through Tradier's sandbox API. Every value below
  // is read from the same state the strategy editor and risk-settings panel
  // already hold — switching strategies, tweaking a parameter, or re-running
  // against a different symbol/timeframe changes this output the next time
  // it's generated, same as generateMarkdownReport above.
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
    // Read generically off whatever value ended up in the resolved params —
    // only the "breakout" strategy defines this key today, but the engine
    // (backtest-engine.ts) applies it to any strategy that carries it, so
    // this stays correct if another strategy picks it up later.
    const trailingStopEmaPeriod =
      Number(resolvedParams.find((p) => p.param.key === 'trailingStopEmaPeriod')?.value ?? 0) || 0;

    const dataset = availableDatasets.find((d) => d.file === result.dataset);
    const symbol = dataset?.symbol ?? result.datasetLabel ?? 'UNKNOWN — pick the symbol this was backtested against';
    const timeframe = dataset?.timeframe ?? 'unknown';

    const exitClauses: string[] = [];
    exitClauses.push(
      shorts
        ? "a 'sell' signal closes an open long, and a 'buy' signal closes an open short (the same handler that generates entries generates exits — see Entry rule)"
        : "a 'sell' signal closes an open long (short selling is off, so there's no short to close)"
    );
    if (sl > 0) exitClauses.push(`stop loss — ${sl}% adverse move from entry price`);
    if (tp > 0) exitClauses.push(`take profit — ${tp}% favorable move from entry price`);
    if (trailingStopEmaPeriod > 0) {
      exitClauses.push(
        `trailing stop — position closes when the bar's CLOSE crosses EMA${trailingStopEmaPeriod} against it (not an intrabar stop)`
      );
    }

    const lines: string[] = [
      '# AWS Lambda Spec: Paper-Trade This Strategy via Tradier Sandbox',
      '',
      'Build and deploy an AWS Lambda function that paper-trades the strategy',
      'below against **Tradier\'s SANDBOX API only**. This is a paper-trading',
      'exercise — sandbox base URL, sandbox access token, sandbox account',
      'number. Nothing in this Lambda should be able to place a live order or',
      'touch a production Tradier account. If anything below is ambiguous,',
      'default to the safer/more conservative reading.',
      '',
      '## Strategy',
      '',
      `- **Name:** ${strat.name}`,
      `- **Logic:** ${strat.description}`,
      `- **Direction:** ${shorts ? 'Long and short' : 'Long only (short selling is disabled for this config)'}`,
      `- **Symbol:** ${symbol}`,
      `- **Bar interval:** ${timeframe}`,
    ];

    if (resolvedParams.length > 0) {
      lines.push('', '### Parameters (as configured in the backtester — use these exact values)', '');
      lines.push('| Parameter | Key | Value | What it controls |');
      lines.push('|---|---|---|---|');
      for (const { param, value } of resolvedParams) {
        lines.push(`| ${param.name} | \`${param.key}\` | **${value}** | ${param.description} |`);
      }
    }

    lines.push(
      '',
      '### Entry rule',
      '',
      "On every new completed bar, recompute this strategy's indicators from",
      'the parameters above and evaluate its buy/sell/hold logic exactly as',
      `described (${strat.description}). Open a long when the signal is 'buy'`,
      'and there is no open position.',
      shorts
        ? "Open a short when the signal is 'sell' and there is no open position."
        : "Short entries are disabled — a 'sell' signal while flat is a no-op.",
      '',
      '### Exit rule',
      '',
      'Close the open position on the FIRST of these that triggers, checked in',
      'this order every bar (matches how the backtest engine resolves a bar',
      'that would hit more than one at once — whichever level price is closer',
      'to at the open wins):',
      '',
      ...exitClauses.map((c, i) => `${i + 1}. ${c}`),
    );

    lines.push(
      '',
      '## Risk Management',
      '',
      `- **Position sizing:** allocate ${posSize}% of current account equity to each new position. Use Tradier's paper account equity/buying power as "equity," not a hardcoded number. Share count is fixed at entry — don't resize an open position.`,
      "- **Max concurrent positions:** 1. This strategy trades a single symbol with one position open at a time — reject or ignore any entry signal while a position is already open.",
      '- **Max daily loss:** NOT part of the backtested config above — the backtester doesn\'t model a daily loss circuit breaker, so pick a number that matches your own risk tolerance rather than treating this as backtested. Make it an env var (e.g. `MAX_DAILY_LOSS_PCT`) instead of hardcoding it, track realized P&L for the current trading day in the state store below, and stop opening new positions once it\'s breached (existing positions can still exit normally via the rules above).',
      `- **Modeled trading costs (informational):** this backtest assumed ${commission}bps commission and ${slippage}bps slippage per fill. Not a Tradier API input, but useful for deciding whether to use market or limit orders and what slippage tolerance to size into a limit price.`,
    );

    lines.push(
      '',
      '## Tradier Integration (sandbox only)',
      '',
      '- **Base URL:** `https://sandbox.tradier.com/v1` — never point this at `api.tradier.com`.',
      '- **Auth:** Bearer token from a Tradier SANDBOX access token. Read it from AWS Secrets Manager at cold start, never hardcode it or commit it.',
      '- **Account:** your Tradier PAPER account number, also from Secrets Manager.',
      `- **Market data:** pull enough trailing history for ${symbol} at the ${timeframe} interval each invocation to cover the longest lookback period among the parameters above, plus a buffer — \`GET /v1/markets/history\` for daily-or-longer bars, \`GET /v1/markets/timesales\` for intraday.`,
      '- **Orders:** place equity orders via `POST /v1/accounts/{account_id}/orders`, `class=equity`. Confirm the fill via `GET /v1/accounts/{account_id}/orders/{id}` before writing the new position to state — don\'t assume an order filled just because the placement call returned 200.',
      '- **Hard guardrail:** refuse to start (fail the invocation loudly) if the configured base URL doesn\'t contain `sandbox.tradier.com`. This check should not be removable by an env var typo.',
    );

    lines.push(
      '',
      '## AWS Architecture',
      '',
      '- **Lambda:** one function; each invocation is a single "fetch data, evaluate, maybe trade" cycle.',
      `- **Trigger:** EventBridge scheduled rule matching the ${timeframe} bar interval (e.g. once daily shortly after close for daily bars, or every few minutes during 9:30am–4:00pm ET on weekdays for intraday). Don't fire outside market hours.`,
      "- **State persistence:** a DynamoDB table keyed by symbol (or symbol+strategy), storing the open position (side, entry price/time, stop and target levels), today's realized P&L and the trading date it applies to (reset at the start of each new day), and today's opened-trade count if you want that as an extra circuit breaker. The Lambda is stateless between invocations — this table is the only thing carrying \"today\" and \"open position\" forward.",
      '- **Secrets:** Tradier sandbox token and paper account number in AWS Secrets Manager, not plaintext Lambda environment variables.',
      "- **IAM:** least privilege — this function needs `secretsmanager:GetSecretValue` on its own secret, read/write on its own DynamoDB table, and CloudWatch Logs write. Nothing broader.",
    );

    lines.push(
      '',
      '## Logging & Error Handling',
      '',
      '- Structured (JSON) log line per invocation: timestamp, symbol, bars fetched, indicator values computed, signal evaluated, action taken (or "no action" + why), resulting position state.',
      '- Wrap Tradier API calls in retry-with-backoff on network/5xx errors only, and give up after a small fixed number of attempts rather than looping.',
      '- If market data is missing, stale, or fails to fetch: take no action and log it — never trade on incomplete data.',
      "- If an order placement fails or its fill can't be confirmed: don't update position state, log it clearly, and prefer alerting (e.g. an SNS topic) over silently retrying next invocation against stale state.",
      '- Wrap the handler body in a top-level try/catch so one bad invocation can\'t leave state half-written.',
    );

    lines.push(
      '',
      '## Explicit non-goals',
      '',
      '- No live/production Tradier trading, ever — sandbox only.',
      `- No instruments beyond ${symbol} as a single equity position — no options, no multi-leg orders.`,
      '- No web UI or manual trigger needed — this is a scheduled background job.',
      '',
      '---',
      '',
      `*Backtested performance for context only (informational — the Lambda doesn't enforce these, they're what this config produced historically): ${result.totalPnlPercent >= 0 ? '+' : ''}${result.totalPnlPercent.toFixed(2)}% P&L over ${result.totalTrades} trades, ${result.winRate.toFixed(1)}% win rate, ${result.maxDrawdownPercent.toFixed(2)}% max drawdown, ${result.sharpeRatio.toFixed(2)} Sharpe. Dataset: ${result.datasetLabel ?? dataset?.label ?? 'n/a'}. Backtest initial capital: $${INITIAL_CAPITAL.toLocaleString()} (not necessarily your paper account's balance).*`,
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
              <div className='flex-1 flex items-center justify-center p-8'>
                <div className='w-full max-w-md mx-auto px-6 text-center'>
                  <div className='mb-6'>
                    <div className='inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-50 border border-blue-200 mb-4'>
                      <svg className='w-8 h-8 text-blue-500 animate-spin' fill='none' viewBox='0 0 24 24'>
                        <circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='4' />
                        <path className='opacity-75' fill='currentColor' d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z' />
                      </svg>
                    </div>
                    <h2 className='text-xl font-semibold text-gray-900 mb-1'>Running Backtest</h2>
                    <p className='text-sm text-gray-600'>
                      {backtestProgress?.currentDataset
                        ? `Processing ${backtestProgress.currentDataset}…`
                        : 'Initialising…'}
                    </p>
                  </div>

                  {backtestProgress && backtestProgress.total > 0 && (
                    <div className='mb-6'>
                      <div className='flex items-center justify-between text-xs text-gray-600 mb-2'>
                        <span>{backtestProgress.completed} / {backtestProgress.total} datasets</span>
                        <span>{Math.round((backtestProgress.completed / backtestProgress.total) * 100)}%</span>
                      </div>
                      <div className='w-full h-2 bg-gray-200 rounded-full overflow-hidden'>
                        <div
                          className='h-full bg-blue-500 rounded-full transition-all duration-300'
                          style={{ width: `${Math.round((backtestProgress.completed / backtestProgress.total) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      cancelBacktest();
                      setIsRunningBatch(false);
                    }}
                    className='px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm rounded transition-colors'
                  >
                    Cancel
                  </button>
                </div>
              </div>
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
                          ? `Running ${backtestProgress.completed}/${backtestProgress.total}…`
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
