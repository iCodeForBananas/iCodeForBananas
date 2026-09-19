"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import BacktestChart from "../components/BacktestChart";
import EquityCurveChart from "../components/EquityCurveChart";
import BentoPageLayout from "../components/BentoPageLayout";
import { Bento } from "../components/ui/bento";
import {
  Badge,
  Box,
  Button,
  Callout,
  Checkbox,
  CheckboxGroup,
  Code,
  Flex,
  Grid,
  IconButton,
  ScrollArea,
  Switch,
  Table,
  Tabs,
  Text,
  TextField,
} from "@radix-ui/themes";
import { Check, ChevronDown, ClipboardCopy, Play, X, Zap } from "lucide-react";
import { cn } from "@/app/lib/utils";
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

// Which datasets and strategies are ticked is deliberately not in here: the page
// always opens with nothing selected, so a run is always something you chose.
interface GlobalSettings {
  selectedStrategyId: string;
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
  const [selectedStrategyIds, setSelectedStrategyIds] = useState<string[]>([]);
  // Accordion expand/collapse state for the strategy list — purely UI, not persisted.
  const [expandedStrategyIds, setExpandedStrategyIds] = useState<string[]>([]);
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

  // The datasets the ticker search currently shows. The timeframe chips and
  // "All" act on these only: typing NQ and pressing 1D must pick NQ 1D, not
  // every symbol's 1D file.
  const filteredDatasets = useMemo(
    () => availableDatasets.filter((ds) => ds.symbol.toLowerCase().includes(datasetSearch.toLowerCase())),
    [availableDatasets, datasetSearch]
  );

  // Toggle selection of the visible datasets with a given timeframe
  const toggleTimeframe = useCallback(
    (timeframe: string) => {
      const filesForTimeframe = filteredDatasets
        .filter((ds) => ds.timeframe === timeframe)
        .map((ds) => ds.file);
      const allSelected = filesForTimeframe.every((f) => selectedFiles.includes(f));
      if (allSelected) {
        setSelectedFiles((prev) => prev.filter((f) => !filesForTimeframe.includes(f)));
      } else {
        setSelectedFiles((prev) => [...new Set([...prev, ...filesForTimeframe])]);
      }
    },
    [filteredDatasets, selectedFiles]
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
        }
      } catch (err) {
        console.error("Error fetching datasets:", err);
      }
    }
    fetchDatasets();
  }, []);

  // Save global settings when any global preference changes
  useEffect(() => {
    saveGlobalSettings({ selectedStrategyId, showEquityCurve, visibleCandles });
  }, [selectedStrategyId, showEquityCurve, visibleCandles]);

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

  const allStrategyIds = Object.keys(AVAILABLE_STRATEGIES);
  const runLabel = isRunningBatch
    ? backtestProgress
      ? `Running ${backtestProgress.completed.toLocaleString()}/${backtestProgress.total ? backtestProgress.total.toLocaleString() : "…"}…`
      : "Running…"
    : !mounted
    ? "Run"
    : (() => {
        // The editor's strategy counts only if it's ticked.
        let totalRuns = 0;
        for (const sid of selectedStrategyIds) {
          if (sid === selectedStrategyId) {
            totalRuns += combinationCount;
            continue;
          }
          const saved = buildSavedRun(sid);
          if (!saved) continue;
          totalRuns += generateCombinations(saved.paramVariations).length;
        }
        const strategies = selectedStrategyIds.length > 1 ? ` across ${selectedStrategyIds.length} strategies` : "";
        return `Run ${(totalRuns * selectedFiles.length).toLocaleString()} variations${strategies}`;
      })();

  return (
    <BentoPageLayout title='Algo Backtest'>
      {error ? (
        <Callout.Root color='red' role='alert' className='m-auto max-w-lg'>
          <Callout.Text>
            <strong>Backtest failed.</strong> {error}
          </Callout.Text>
        </Callout.Root>
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
        <Flex direction='column' gap='4' className='min-w-0'>
          {/* ── Configuration ─────────────────────────────────────── */}
          <Grid columns={{ initial: "1", sm: "2", lg: "4" }} gap='3' align='start'>
            <Bento
              title='Data'
              actions={
                <>
                  <Button
                    size='1'
                    variant='ghost'
                    onClick={() => setSelectedFiles((prev) => [...new Set([...prev, ...filteredDatasets.map((ds) => ds.file)])])}
                    title={datasetSearch ? "Select every dataset matching the search" : "Select every dataset"}
                  >
                    All
                  </Button>
                  <Button
                    size='1'
                    variant='ghost'
                    color='gray'
                    onClick={() => setSelectedFiles([])}
                    disabled={selectedFiles.length === 0}
                  >
                    None
                  </Button>
                  <Badge color='gray' variant='soft'>{selectedFiles.length} selected</Badge>
                </>
              }
            >
              <Flex direction='column' gap='2'>
                <TextField.Root
                  size='1'
                  value={datasetSearch}
                  onChange={(e) => setDatasetSearch(e.target.value)}
                  placeholder='Search ticker…'
                  aria-label='Search datasets by ticker'
                />
                {uniqueTimeframes.length > 1 && (
                  <Flex wrap='wrap' gap='1'>
                    {uniqueTimeframes.map((tf) => {
                      const filesForTf = filteredDatasets.filter((ds) => ds.timeframe === tf).map((ds) => ds.file);
                      if (filesForTf.length === 0) return null;
                      const allSelected = filesForTf.every((f) => selectedFiles.includes(f));
                      return (
                        <Button
                          key={tf}
                          size='1'
                          variant={allSelected ? "solid" : "soft"}
                          color={allSelected ? undefined : "gray"}
                          onClick={() => toggleTimeframe(tf)}
                          aria-pressed={allSelected}
                        >
                          {tf.toUpperCase()}
                        </Button>
                      );
                    })}
                  </Flex>
                )}
                <ScrollArea type='auto' scrollbars='vertical' style={{ maxHeight: 176 }}>
                  <CheckboxGroup.Root size='1' value={selectedFiles} onValueChange={setSelectedFiles} className='gap-1 pr-3'>
                    {filteredDatasets.map((ds) => (
                      <CheckboxGroup.Item key={ds.file} value={ds.file}>
                        {ds.label}
                      </CheckboxGroup.Item>
                    ))}
                  </CheckboxGroup.Root>
                </ScrollArea>
                {selectedFiles.length === 0 ? (
                  <Text size='1' color='gray'>
                    Pick at least one dataset.
                  </Text>
                ) : (
                  // Everything that will run, including anything the search is
                  // hiding, so a selection can never be invisible.
                  <Flex wrap='wrap' gap='1' aria-label='Selected datasets'>
                    {selectedFiles.map((file) => (
                      <Badge key={file} variant='soft' className='gap-1 pr-0.5'>
                        {availableDatasets.find((ds) => ds.file === file)?.label ?? file}
                        <IconButton
                          size='1'
                          variant='ghost'
                          radius='full'
                          aria-label={`Remove ${availableDatasets.find((ds) => ds.file === file)?.label ?? file}`}
                          onClick={() => setSelectedFiles((prev) => prev.filter((f) => f !== file))}
                          className='m-0 h-4 w-4 min-w-0'
                        >
                          <X className='h-3 w-3' />
                        </IconButton>
                      </Badge>
                    ))}
                  </Flex>
                )}
              </Flex>
            </Bento>

            <Bento
              title='Strategy'
              actions={
                <>
                  <Button
                    size='1'
                    variant='ghost'
                    onClick={() =>
                      setSelectedStrategyIds(selectedStrategyIds.length === allStrategyIds.length ? [] : allStrategyIds)
                    }
                  >
                    {selectedStrategyIds.length === allStrategyIds.length ? "Clear" : "All"}
                  </Button>
                  <Badge color='gray' variant='soft'>{selectedStrategyIds.length} selected</Badge>
                </>
              }
            >
              <ScrollArea type='auto' scrollbars='vertical' style={{ maxHeight: 280 }}>
                <Flex direction='column' gap='1' className='pr-3'>
                  {Object.values(AVAILABLE_STRATEGIES).map((s) => {
                    const isChecked = selectedStrategyIds.includes(s.id);
                    const isActive = s.id === selectedStrategyId;
                    // The editor always has a strategy, but it only reads as picked
                    // once it is ticked or opened, so a fresh page shows nothing chosen.
                    const emphasized = isActive && (isChecked || expandedStrategyIds.includes(s.id));
                    const isExpanded = expandedStrategyIds.includes(s.id);
                    const numericParams = s.parameters?.filter((p) => p.type === "number") ?? [];
                    const hasParams = numericParams.length > 0;
                    const savedRun = mounted && !isActive ? buildSavedRun(s.id) : null;

                    const toggleExpand = () => {
                      setExpandedStrategyIds((prev) =>
                        prev.includes(s.id) ? prev.filter((id) => id !== s.id) : [...prev, s.id]
                      );
                      setSelectedStrategyId(s.id);
                    };

                    return (
                      <Box key={s.id}>
                        <Flex
                          align='center'
                          gap='2'
                          px='2'
                          py='1'
                          className={cn("rounded-md", isChecked && "bg-[var(--accent-a3)]")}
                        >
                          <Checkbox
                            size='1'
                            checked={isChecked}
                            aria-label={`Include ${s.name}`}
                            onCheckedChange={(checked) => {
                              if (checked === true) {
                                if (!isChecked) setSelectedStrategyIds([...selectedStrategyIds, s.id]);
                                // Ticking one while the editor shows an unticked strategy
                                // moves the editor to what was just picked.
                                if (!selectedStrategyIds.includes(selectedStrategyId)) setSelectedStrategyId(s.id);
                              } else {
                                const next = selectedStrategyIds.filter((id) => id !== s.id);
                                setSelectedStrategyIds(next);
                                if (s.id === selectedStrategyId && next.length > 0) setSelectedStrategyId(next[0]);
                              }
                            }}
                          />
                          <Text
                            size='2'
                            weight={emphasized ? "medium" : "regular"}
                            color={emphasized ? undefined : "gray"}
                            highContrast={!emphasized}
                            className={cn("flex-1", hasParams && "cursor-pointer")}
                            onClick={() => {
                              if (hasParams) toggleExpand();
                            }}
                          >
                            {s.name}
                          </Text>
                          {hasParams && (
                            <IconButton
                              size='1'
                              variant='ghost'
                              color='gray'
                              onClick={toggleExpand}
                              aria-label={isExpanded ? `Collapse ${s.name} settings` : `Expand ${s.name} settings`}
                              aria-expanded={isExpanded}
                            >
                              <ChevronDown className={cn("size-4 transition-transform", isExpanded && "rotate-180")} />
                            </IconButton>
                          )}
                        </Flex>

                        {isExpanded && hasParams && (
                          <Box ml='4' pl='3' py='2' className='border-l-2 border-line-strong'>
                            {isActive ? (
                              <Flex wrap='wrap' gap='3'>
                                {numericParams.map((param) => {
                                  const variation = paramVariations.find((v) => v.key === param.key);
                                  const setBound = (bound: "min" | "max", raw: string) => {
                                    const parsed = parseFloat(raw);
                                    const fallback = Number(param[bound] ?? param.default);
                                    const value = isNaN(parsed) ? fallback : parsed;
                                    setParamVariations((prev) =>
                                      prev.map((v) => (v.key === param.key ? { ...v, [bound]: value } : v))
                                    );
                                  };
                                  return (
                                    <Flex key={param.key} direction='column' gap='1'>
                                      <Text size='1' weight='medium'>
                                        {param.name}
                                      </Text>
                                      <Flex gap='1' align='end'>
                                        <NumberField
                                          label='Min'
                                          value={variation?.min ?? param.min ?? Number(param.default)}
                                          min={param.min}
                                          max={param.max}
                                          step={param.step}
                                          onChange={(raw) => setBound("min", raw)}
                                          className='w-20'
                                        />
                                        <Text size='1' color='gray' className='pb-1.5'>
                                          →
                                        </Text>
                                        <NumberField
                                          label='Max'
                                          value={variation?.max ?? param.max ?? Number(param.default)}
                                          min={param.min}
                                          max={param.max}
                                          step={param.step}
                                          onChange={(raw) => setBound("max", raw)}
                                          className='w-20'
                                        />
                                      </Flex>
                                    </Flex>
                                  );
                                })}
                              </Flex>
                            ) : (
                              <Flex wrap='wrap' align='end' gap='3'>
                                {numericParams.map((param) => {
                                  const variation = savedRun?.paramVariations.find((v) => v.key === param.key);
                                  const min = variation?.min ?? param.min ?? Number(param.default);
                                  const max = variation?.max ?? param.max ?? Number(param.default);
                                  return (
                                    <Flex key={param.key} direction='column' gap='1'>
                                      <Text size='1' weight='medium'>
                                        {param.name}
                                      </Text>
                                      <Code size='1' variant='ghost' color='gray'>
                                        {min !== max ? `${min} → ${max}` : String(min)}
                                      </Code>
                                    </Flex>
                                  );
                                })}
                                <Button size='1' variant='ghost' onClick={() => setSelectedStrategyId(s.id)}>
                                  Edit →
                                </Button>
                              </Flex>
                            )}
                          </Box>
                        )}
                      </Box>
                    );
                  })}
                </Flex>
              </ScrollArea>
            </Bento>

            <Bento title='Risk'>
              <Flex wrap='wrap' gap='3'>
                <NumberField
                  label='Stop loss %'
                  value={stopLossPercent}
                  min={0}
                  step={0.5}
                  placeholder='0 = off'
                  onChange={(raw) => {
                    const v = parseFloat(raw);
                    setStopLossPercent(isNaN(v) ? 0 : Math.max(0, v));
                  }}
                />
                <NumberField
                  label='Take profit %'
                  value={takeProfitPercent}
                  min={0}
                  step={0.5}
                  placeholder='0 = off'
                  onChange={(raw) => {
                    const v = parseFloat(raw);
                    setTakeProfitPercent(isNaN(v) ? 0 : Math.max(0, v));
                  }}
                />
                <NumberField
                  label='Position size %'
                  value={positionSizePercent}
                  min={0}
                  max={100}
                  step={1}
                  onChange={(raw) => {
                    const v = parseFloat(raw);
                    setPositionSizePercent(isNaN(v) ? 100 : Math.max(0, Math.min(100, v)));
                  }}
                />
              </Flex>
            </Bento>

            <Bento title='Execution'>
              <Flex direction='column' gap='3'>
                <Flex wrap='wrap' gap='3'>
                  <NumberField
                    label='Commission (bps)'
                    value={commissionBps}
                    min={0}
                    step={0.5}
                    placeholder='per fill'
                    onChange={(raw) => {
                      const v = parseFloat(raw);
                      setCommissionBps(isNaN(v) ? 0 : Math.max(0, v));
                    }}
                  />
                  <NumberField
                    label='Slippage (bps)'
                    value={slippageBps}
                    min={0}
                    step={0.5}
                    placeholder='per fill'
                    onChange={(raw) => {
                      const v = parseFloat(raw);
                      setSlippageBps(isNaN(v) ? 0 : Math.max(0, v));
                    }}
                  />
                </Flex>
                <Text as='label' size='2'>
                  <Flex gap='2' align='center'>
                    <Switch size='1' checked={enableShorts} onCheckedChange={setEnableShorts} />
                    Enable shorts
                  </Flex>
                </Text>
              </Flex>
            </Bento>
          </Grid>

          <Flex justify='end'>
            <Button
              size='3'
              onClick={runBatchBacktest}
              disabled={isRunningBatch || selectedFiles.length === 0 || selectedStrategyIds.length === 0}
              className='w-full sm:w-auto'
            >
              <Play className='size-4' />
              {runLabel}
            </Button>
          </Flex>

          {/* ── Results ───────────────────────────────────────────── */}
          {results.length === 0 ? (
            <Flex align='center' justify='center' py='9'>
              <Text size='2' color='gray'>
                Run a backtest to see results.
              </Text>
            </Flex>
          ) : (
            <Flex direction='column' gap='3' className='min-w-0'>
              {results.length > 1 && (
                <Tabs.Root value={String(activeResultTab)} onValueChange={(v) => setActiveResultTab(Number(v))}>
                  <Tabs.List size='1' className='overflow-x-auto'>
                    {results.slice(0, 10).map((result, idx) => {
                      const showStrategy =
                        new Set(results.map((r) => r.strategyId).filter(Boolean)).size > 1 && result.strategyName;
                      return (
                        <Tabs.Trigger
                          key={idx}
                          value={String(idx)}
                          title={`${result.strategyName ?? ""} ${result.datasetLabel ?? ""} ${result.label}`.trim()}
                        >
                          <Flex gap='1' className='whitespace-nowrap'>
                            #{idx + 1}
                            {showStrategy && <span>{result.strategyName}</span>}
                            <Text color={result.totalPnlPercent >= 0 ? "green" : "red"}>
                              {formatSigned(result.totalPnlPercent, 1)}%
                            </Text>
                          </Flex>
                        </Tabs.Trigger>
                      );
                    })}
                    {results.length > 10 && (
                      <Text size='1' color='gray' className='self-center whitespace-nowrap px-3'>
                        +{results.length - 10} more
                      </Text>
                    )}
                  </Tabs.List>
                </Tabs.Root>
              )}

              {activeResult && results.length > 1 && (
                <Flex wrap='wrap' gap='4' className='gap-y-1'>
                  {activeResult.strategyName && (
                    <Text size='1' color='gray'>
                      Strategy <Text highContrast weight='medium'>{activeResult.strategyName}</Text>
                    </Text>
                  )}
                  {activeResult.datasetLabel && (
                    <Text size='1' color='gray'>
                      Dataset <Text highContrast>{activeResult.datasetLabel}</Text>
                    </Text>
                  )}
                  <Text size='1' color='gray'>
                    Parameters <Code size='1' variant='ghost'>{activeResult.label}</Code>
                  </Text>
                </Flex>
              )}

              {activeResult && (
                <>
                  <Grid columns={{ initial: "2", sm: "3", xl: "6" }} gap='3'>
                    <Stat label='Strategy P&L' tone={toneOf(activeResult.totalPnlPercent)}>
                      {formatSigned(activeResult.totalPnlPercent, 2)}%
                    </Stat>
                    <Stat label='Buy & hold' tone={toneOf(activeResult.buyAndHoldPnlPercent)}>
                      {formatSigned(activeResult.buyAndHoldPnlPercent, 2)}%
                    </Stat>
                    <Stat
                      label='Win rate'
                      detail={`${activeResult.winningTrades}W / ${activeResult.losingTrades}L`}
                    >
                      {activeResult.winRate.toFixed(1)}%
                    </Stat>
                    <Stat label='Profit factor' tone={(activeResult.profitFactor ?? 0) >= 1 ? "green" : "red"}>
                      {activeResult.profitFactor == null
                        ? "N/A"
                        : activeResult.profitFactor === Infinity
                        ? "∞"
                        : activeResult.profitFactor.toFixed(2)}
                    </Stat>
                    <Stat label='Max drawdown' tone='red'>
                      -{activeResult.maxDrawdownPercent.toFixed(2)}%
                    </Stat>
                    <Stat
                      label='Sharpe ratio'
                      tone={activeResult.sharpeRatio >= 1 ? "green" : activeResult.sharpeRatio < 0 ? "red" : undefined}
                    >
                      {activeResult.sharpeRatio.toFixed(2)}
                    </Stat>
                  </Grid>

                  <Flex direction={{ initial: "column", sm: "row" }} gap='2' justify='between' align={{ sm: "center" }}>
                    <Flex wrap='wrap' gap='4' className='gap-y-1'>
                      <Text size='2' color='gray'>
                        Trades <Text highContrast>{activeResult.totalTrades}</Text>
                      </Text>
                      <Text size='2' color='gray'>
                        Avg win <Text color='green'>${activeResult.averageWin.toFixed(2)}</Text>
                      </Text>
                      <Text size='2' color='gray'>
                        Avg loss <Text color='red'>-${activeResult.averageLoss.toFixed(2)}</Text>
                      </Text>
                      <Text size='2' color='gray'>
                        Alpha vs B&amp;H{" "}
                        <Text weight='bold' color={toneOf(activeResult.totalPnlPercent - activeResult.buyAndHoldPnlPercent)}>
                          {formatSigned(activeResult.totalPnlPercent - activeResult.buyAndHoldPnlPercent, 2)}%
                        </Text>
                      </Text>
                    </Flex>
                    <Flex wrap='wrap' align='center' gap='3'>
                      <Text as='label' size='2'>
                        <Flex gap='2' align='center'>
                          <Switch size='1' checked={showEquityCurve} onCheckedChange={setShowEquityCurve} />
                          Equity curve
                        </Flex>
                      </Text>
                      <Button
                        size='1'
                        variant='soft'
                        color={copied ? "green" : "gray"}
                        onClick={copyReport}
                        title='Copy backtest report as markdown for LLM review'
                      >
                        {copied ? <Check className='size-3.5' /> : <ClipboardCopy className='size-3.5' />}
                        {copied ? "Copied!" : "Copy report"}
                      </Button>
                      <Button
                        size='1'
                        variant='soft'
                        color={lambdaPromptCopied ? "green" : undefined}
                        onClick={copyLambdaPrompt}
                        title='Copy a prompt that has Claude write an AWS Lambda that paper-trades this strategy through the Tradier sandbox'
                      >
                        {lambdaPromptCopied ? <Check className='size-3.5' /> : <Zap className='size-3.5' />}
                        {lambdaPromptCopied ? "Copied!" : "Copy Lambda prompt"}
                      </Button>
                    </Flex>
                  </Flex>
                </>
              )}

              <Bento className='overflow-hidden p-0'>
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
                {showEquityCurve && activeResult && (
                  <div className='h-48 border-t border-line-subtle'>
                    <EquityCurveChart equityCurve={activeResult.equityCurve} initialCapital={INITIAL_CAPITAL} />
                  </div>
                )}
              </Bento>

              {activeResult && activeResult.trades.length > 0 && (
                <Bento title={`Trade log · ${activeResult.trades.length} trades`}>
                  <Table.Root size='1' variant='ghost' className='h-96'>
                    <Table.Header className='sticky top-0 z-[1] bg-[var(--color-panel-solid)]'>
                      <Table.Row>
                        <Table.ColumnHeaderCell>Side</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell>Entry time</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell justify='end'>Entry price</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell>Exit time</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell justify='end'>Exit price</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell justify='end'>P&amp;L</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell justify='end'>P&amp;L %</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell>Reason</Table.ColumnHeaderCell>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {activeResult.trades.map((trade) => {
                        const selected = selectedTradeId === trade.id;
                        return (
                          <Table.Row
                            key={trade.id}
                            aria-selected={selected}
                            className={cn(
                              "cursor-pointer hover:bg-[var(--gray-a3)]",
                              selected && "bg-[var(--accent-a4)] hover:bg-[var(--accent-a4)]"
                            )}
                            onClick={() => setSelectedTradeId(selected ? null : trade.id)}
                          >
                            <Table.Cell>
                              <Badge size='1' color={trade.side === "LONG" ? "green" : "red"} variant='soft'>
                                {trade.side}
                              </Badge>
                            </Table.Cell>
                            <Table.Cell className='whitespace-nowrap'>{new Date(trade.entryTime).toLocaleString()}</Table.Cell>
                            <Table.Cell justify='end'>${trade.entryPrice.toFixed(2)}</Table.Cell>
                            <Table.Cell className='whitespace-nowrap'>{new Date(trade.exitTime).toLocaleString()}</Table.Cell>
                            <Table.Cell justify='end'>${trade.exitPrice.toFixed(2)}</Table.Cell>
                            <Table.Cell justify='end'>
                              <Text color={toneOf(trade.pnl)} className='tabular-nums'>
                                {trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)}
                              </Text>
                            </Table.Cell>
                            <Table.Cell justify='end'>
                              <Text color={toneOf(trade.pnlPercent)} className='tabular-nums'>
                                {formatSigned(trade.pnlPercent, 2)}%
                              </Text>
                            </Table.Cell>
                            <Table.Cell className='max-w-[240px] truncate' title={trade.reason}>
                              <Text color='gray'>{trade.reason}</Text>
                            </Table.Cell>
                          </Table.Row>
                        );
                      })}
                    </Table.Body>
                  </Table.Root>
                </Bento>
              )}
            </Flex>
          )}
        </Flex>
      )}
    </BentoPageLayout>
  );
}

const formatSigned = (n: number, digits: number) => `${n >= 0 ? "+" : ""}${n.toFixed(digits)}`;
const toneOf = (n: number): "green" | "red" => (n >= 0 ? "green" : "red");

/** One headline number in the results row. */
function Stat({
  label,
  tone,
  detail,
  children,
}: {
  label: string;
  tone?: "green" | "red";
  detail?: string;
  children: React.ReactNode;
}) {
  return (
    <Bento size='1' title={label} className='min-w-0'>
      <Text as='div' size='5' weight='bold' color={tone} highContrast={!tone} className='tabular-nums'>
        {children}
        {detail && (
          <Text size='2' weight='regular' color='gray' className='ml-1'>
            ({detail})
          </Text>
        )}
      </Text>
    </Bento>
  );
}

/** A labelled number input. `onChange` gets the raw string so callers decide how to parse and clamp. */
function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  placeholder,
  className,
}: {
  label: string;
  value: number;
  onChange: (raw: string) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  className?: string;
}) {
  return (
    <Flex direction='column' gap='1' className={className ?? "min-w-[96px] flex-1"}>
      <Text as='label' size='1' color='gray'>
        {label}
        <TextField.Root
          type='number'
          size='1'
          mt='1'
          value={value}
          min={min}
          max={max}
          step={step}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      </Text>
    </Flex>
  );
}
