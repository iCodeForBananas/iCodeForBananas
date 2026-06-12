"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import BacktestChart from "../components/BacktestChart";
import EquityCurveChart from "../components/EquityCurveChart";
import { IndicatorData, PositionSide } from "@/app/types";
import {
  AVAILABLE_STRATEGIES,
  getDefaultParams,
  createParamLabel,
  ParameterizedResult,
} from "@/app/strategies";
import LambdaExportModal from "../components/LambdaExportModal";
import { createClient } from "@supabase/supabase-js";
import {
  generateCombinations,
  ParameterVariationConfig,
  INITIAL_CAPITAL,
  MAX_BATCH_RUNS,
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


// ── Lambda Readiness Panel ────────────────────────────────────────────────────
interface BacktestResultLike {
  winRate: number;
  profitFactor: number;
  sharpeRatio: number;
  totalTrades: number;
  maxDrawdownPercent: number;
  totalPnlPercent: number;
  buyAndHoldPnlPercent: number;
}

const LAMBDA_CRITERIA = [
  {
    key: "winRate",
    label: "Win Rate ≥ 50%",
    pass: (r: BacktestResultLike) => r.winRate >= 50,
    value: (r: BacktestResultLike) => `${r.winRate.toFixed(1)}%`,
  },
  {
    key: "profitFactor",
    label: "Profit Factor ≥ 1.5",
    pass: (r: BacktestResultLike) => (r.profitFactor ?? 0) >= 1.5,
    value: (r: BacktestResultLike) => r.profitFactor == null ? "N/A" : r.profitFactor === Infinity ? "∞" : r.profitFactor.toFixed(2),
  },
  {
    key: "sharpe",
    label: "Sharpe Ratio ≥ 0.5",
    pass: (r: BacktestResultLike) => r.sharpeRatio >= 0.5,
    value: (r: BacktestResultLike) => r.sharpeRatio.toFixed(2),
  },
  {
    key: "trades",
    label: "≥ 10 Trades",
    pass: (r: BacktestResultLike) => r.totalTrades >= 10,
    value: (r: BacktestResultLike) => String(r.totalTrades),
  },
  {
    key: "drawdown",
    label: "Max Drawdown ≤ 25%",
    pass: (r: BacktestResultLike) => r.maxDrawdownPercent <= 25,
    value: (r: BacktestResultLike) => `${r.maxDrawdownPercent.toFixed(1)}%`,
  },
  {
    key: "alpha",
    label: "Beats Buy & Hold",
    pass: (r: BacktestResultLike) => r.totalPnlPercent > r.buyAndHoldPnlPercent,
    value: (r: BacktestResultLike) => {
      const alpha = r.totalPnlPercent - r.buyAndHoldPnlPercent;
      return `${alpha >= 0 ? "+" : ""}${alpha.toFixed(1)}%`;
    },
  },
];

function LambdaReadinessPanel({
  result,
  onExport,
}: {
  result: BacktestResultLike;
  onExport: () => void;
}) {
  const results = LAMBDA_CRITERIA.map((c) => ({ ...c, passing: c.pass(result) }));
  const passCount = results.filter((r) => r.passing).length;
  const allPass = passCount === results.length;
  const mostPass = passCount >= 5;

  return (
    <div
      className={`mx-4 my-3 rounded-lg border p-3 ${
        allPass
          ? "border-green-400 bg-green-50"
          : mostPass
          ? "border-amber-400 bg-amber-50"
          : "border-gray-200 bg-gray-50"
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              allPass
                ? "bg-green-100 text-green-700"
                : mostPass
                ? "bg-amber-100 text-amber-700"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {allPass ? "✓ DEPLOY READY" : mostPass ? "⚠ ALMOST READY" : "✗ NOT READY"}
          </span>
          <span className="text-xs text-gray-500">{passCount}/{results.length} criteria met</span>
        </div>

        <div className="flex items-center gap-3 flex-1 flex-wrap">
          {results.map((c) => (
            <div key={c.key} className="flex items-center gap-1 text-xs">
              <span className={c.passing ? "text-green-600" : "text-red-500"}>
                {c.passing ? "✓" : "✗"}
              </span>
              <span className={c.passing ? "text-gray-700" : "text-gray-400"}>
                {c.label}
              </span>
              <span className={`font-mono font-bold ${c.passing ? "text-green-600" : "text-red-500"}`}>
                ({c.value(result)})
              </span>
            </div>
          ))}
        </div>

        {allPass && (
          <button
            onClick={onExport}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded transition-colors"
          >
            🚀 Deploy Strategy
          </button>
        )}
      </div>
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

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

  // Lambda export modal state
  const [showLambdaExport, setShowLambdaExport] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  useEffect(() => {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    );
    sb.auth.getSession().then(({ data }) => {
      setAuthToken(data.session?.access_token ?? null);
    });
  }, []);

  // Copy report state
  const [copied, setCopied] = useState(false);

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

  // Backtest only runs on explicit button click ("Run N Variations") — no auto-run on file or param change.

  // Update chart data when switching between result tabs with different datasets
  useEffect(() => {
    const activeResult = results[activeResultTab];
    if (activeResult?.dataset && datasetIndicatorCache.current[activeResult.dataset]) {
      setIndicatorData(datasetIndicatorCache.current[activeResult.dataset]);
    }
  }, [activeResultTab, results]);

  const activeResult = results[activeResultTab];
  const strategy = AVAILABLE_STRATEGIES[selectedStrategyId];

  const chartTrades = useMemo(
    () =>
      activeResult?.trades.map((t) => ({
        ...t,
        side: t.side === "LONG" ? PositionSide.LONG : PositionSide.SHORT,
      })) ?? [],
    [activeResult]
  );

  return (
    <div className='flex flex-col'>
      <main className='flex flex-col p-2 sm:p-4'>
        <div
          className='flex flex-col rounded-2xl'
          style={{ background: '#fff', border: '1px solid var(--border-color)' }}
        >
          {/* Header */}
          <div className='border-b shrink-0' style={{ borderColor: 'var(--border-color)' }}>
            <div className='px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-5'>
              <h1 className='text-2xl sm:text-3xl font-bold leading-tight' style={{ color: '#000' }}>
                Algo Backtest
              </h1>
            </div>
          </div>

          {/* Content */}
          <div className='flex flex-col'>
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
                    <p className='text-sm text-gray-500'>
                      {backtestProgress?.currentDataset
                        ? `Processing ${backtestProgress.currentDataset}…`
                        : 'Initialising…'}
                    </p>
                  </div>

                  {backtestProgress && backtestProgress.total > 0 && (
                    <div className='mb-6'>
                      <div className='flex items-center justify-between text-xs text-gray-500 mb-2'>
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
              <div className='flex flex-col'>

                {/* ── Configuration (top) ─────────────────────────────── */}
                <div className='shrink-0 border-b border-gray-200 px-4 py-3'>
                  <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3'>

                    {/* Data */}
                    <div className='flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50/60 p-3'>
                      <div className='flex items-center justify-between'>
                        <span className='text-[10px] font-semibold uppercase tracking-wide text-gray-400'>Data</span>
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
                            className='text-xs text-gray-400 hover:text-gray-600 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors'
                          >
                            None
                          </button>
                          <span className='text-xs text-gray-400'>{selectedFiles.length} sel</span>
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
                                    : 'bg-white border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600'
                                }`}
                              >
                                {tf.toUpperCase()}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <div className='max-h-28 overflow-y-auto bg-white border border-gray-200 rounded p-1 space-y-0.5'>
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
                        <span className='text-[10px] font-semibold uppercase tracking-wide text-gray-400'>Strategy</span>
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
                          <span className='text-xs text-gray-400'>{selectedStrategyIds.length} sel</span>
                          <button
                            onClick={() => setShowLambdaExport(true)}
                            className='flex items-center gap-1 px-2 py-0.5 bg-amber-500 hover:bg-amber-400 text-white text-[10px] font-medium rounded transition-colors'
                            title='Deploy this strategy to run automatically'
                          >
                            <svg className='w-3 h-3' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12' />
                            </svg>
                            Deploy
                          </button>
                        </div>
                      </div>
                      <div className='max-h-28 overflow-y-auto bg-white border border-gray-200 rounded p-1 space-y-0.5'>
                        {Object.values(AVAILABLE_STRATEGIES).map((s) => {
                          const isChecked = selectedStrategyIds.includes(s.id);
                          const isActive = s.id === selectedStrategyId;
                          return (
                            <div
                              key={s.id}
                              className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer ${
                                isActive ? 'bg-blue-50 ring-1 ring-blue-400' : 'hover:bg-gray-50'
                              }`}
                              onClick={() => {
                                setSelectedStrategyId(s.id);
                                setSelectedStrategyIds((prev) =>
                                  prev.includes(s.id) ? prev : [...prev, s.id]
                                );
                              }}
                            >
                              <input
                                type='checkbox'
                                checked={isChecked}
                                onChange={(e) => {
                                  e.stopPropagation();
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
                                onClick={(e) => e.stopPropagation()}
                                className='rounded border-gray-300 text-blue-500'
                              />
                              <span className={`text-xs ${isActive ? 'text-blue-700 font-medium' : 'text-gray-900'}`}>
                                {s.name}
                              </span>
                              {isActive && (
                                <span className='ml-auto text-[10px] uppercase tracking-wide text-blue-600'>editing</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {strategy?.description && (
                        <p className='text-[10px] text-gray-400 leading-tight'>{strategy.description}</p>
                      )}

                      {/* Strategy Parameters — inline min/max ranges */}
                      {selectedStrategyIds.length > 0 && strategy?.parameters && strategy.parameters.filter((p) => p.type === 'number').length > 0 && (
                        <div className='flex flex-col gap-1.5 pt-2 border-t border-gray-200'>
                          <div className='flex items-center justify-between'>
                            <span className='text-[10px] text-gray-400'>
                              {selectedStrategyIds.length} {selectedStrategyIds.length === 1 ? 'strategy' : 'strategies'} × {selectedFiles.length} datasets
                            </span>
                            <span className='text-xs text-gray-400'>{combinationCount} combos</span>
                          </div>
                          <div className='flex flex-wrap gap-3'>
                            {strategy.parameters
                              .filter((param) => param.type === 'number')
                              .map((param) => {
                                const variation = paramVariations.find((v) => v.key === param.key);
                                return (
                                  <div key={param.key} className='flex flex-col gap-1'>
                                    <span className='text-xs text-gray-700 font-medium'>{param.name}</span>
                                    <div className='flex gap-1 items-center'>
                                      <div>
                                        <label className='block text-[10px] text-gray-500 mb-0.5'>Min</label>
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
                                      <span className='text-gray-400 text-xs self-end pb-2'>→</span>
                                      <div>
                                        <label className='block text-[10px] text-gray-500 mb-0.5'>Max</label>
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
                        </div>
                      )}

                      {/* Other selected strategies — compact read-only cards */}
                      {mounted && selectedStrategyIds.filter((sid) => sid !== selectedStrategyId).length > 0 && (
                        <div className='flex flex-wrap gap-2 pt-2 border-t border-gray-200'>
                          {selectedStrategyIds
                            .filter((sid) => sid !== selectedStrategyId)
                            .map((sid) => {
                              const otherStrat = AVAILABLE_STRATEGIES[sid];
                              if (!otherStrat) return null;
                              const savedRun = buildSavedRun(sid);
                              if (!savedRun) return null;
                              const numericParams = otherStrat.parameters?.filter((p) => p.type === 'number') ?? [];
                              const otherCombos = generateCombinations(savedRun.paramVariations).length;

                              return (
                                <div
                                  key={sid}
                                  onClick={() => setSelectedStrategyId(sid)}
                                  className='flex flex-col gap-1 border border-gray-200 hover:border-blue-400 bg-white rounded p-2 cursor-pointer transition-colors'
                                  title='Click to edit this strategy'
                                >
                                  <div className='flex items-center gap-2'>
                                    <span className='text-xs text-gray-900 font-semibold'>{otherStrat.name}</span>
                                    <span className='text-[10px] uppercase tracking-wide text-gray-400'>saved</span>
                                    <span className='text-xs text-gray-400'>{otherCombos} combos</span>
                                  </div>
                                  {numericParams.length > 0 && (
                                    <div className='flex items-center gap-3'>
                                      {numericParams.map((param) => {
                                        const variation = savedRun.paramVariations.find((v) => v.key === param.key);
                                        const min = variation?.min ?? param.min ?? Number(param.default);
                                        const max = variation?.max ?? param.max ?? Number(param.default);
                                        const isRange = min !== max;
                                        return (
                                          <span key={param.key} className='text-[10px] font-mono text-gray-700'>
                                            {param.name}: {isRange ? `${min}→${max}` : String(min)}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  )}
                                  <span className='text-[10px] text-blue-600'>Click to edit →</span>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>

                    {/* Risk */}
                    <div className='flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50/60 p-3'>
                      <span className='text-[10px] font-semibold uppercase tracking-wide text-gray-400'>Risk</span>
                      <div className='flex flex-wrap gap-2'>
                        <div className='flex flex-col gap-1 flex-1 min-w-[90px]'>
                          <label className='text-xs text-gray-500'>Stop Loss %</label>
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
                          <label className='text-xs text-gray-500'>Take Profit %</label>
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
                          <label className='text-xs text-gray-500'>Position Size %</label>
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
                      <span className='text-[10px] font-semibold uppercase tracking-wide text-gray-400'>Execution</span>
                      <div className='flex flex-wrap gap-2 items-end'>
                        <div className='flex flex-col gap-1 flex-1 min-w-[90px]'>
                          <label className='text-xs text-gray-500'>Commission (bps)</label>
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
                          <label className='text-xs text-gray-500'>Slippage (bps)</label>
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
                            <span className='text-xs text-gray-500'>Enable Shorts</span>
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
                    <p className='text-sm text-gray-400'>Run a backtest to see results</p>
                  </div>
                )}
                {results.length > 0 && <div className='flex flex-col'>

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
                                : "border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-100"
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
                        <span className='px-4 py-2 text-xs text-gray-400'>+{results.length - 10} more</span>
                      )}
                    </div>
                  )}

                  {/* Active Result Label */}
                  {activeResult && results.length > 1 && (
                    <div className='px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs shrink-0'>
                      {activeResult.strategyName && (
                        <>
                          <span className='text-gray-500'>Strategy: </span>
                          <span className='text-purple-600 mr-3 font-medium'>{activeResult.strategyName}</span>
                        </>
                      )}
                      {activeResult.datasetLabel && (
                        <>
                          <span className='text-gray-500'>Dataset: </span>
                          <span className='text-blue-600 mr-3'>{activeResult.datasetLabel}</span>
                        </>
                      )}
                      <span className='text-gray-500'>Parameters: </span>
                      <span className='font-mono text-blue-600'>{activeResult.label}</span>
                    </div>
                  )}

                  {/* Stats Panel */}
                  {activeResult && (
                    <div className='p-4 border-b border-gray-200 bg-gray-50 shrink-0'>
                      <div className='grid grid-cols-6 gap-4 text-sm'>
                        <div className='bg-white border border-gray-200 rounded p-3'>
                          <div className='text-gray-500 text-xs mb-1'>Strategy P&L</div>
                          <div
                            className={`text-lg font-bold ${activeResult.totalPnlPercent >= 0 ? "text-green-600" : "text-red-500"}`}
                          >
                            {activeResult.totalPnlPercent >= 0 ? "+" : ""}{activeResult.totalPnlPercent.toFixed(2)}%
                          </div>
                        </div>
                        <div className='bg-white border border-gray-200 rounded p-3'>
                          <div className='text-gray-500 text-xs mb-1'>Buy & Hold</div>
                          <div
                            className={`text-lg font-bold ${activeResult.buyAndHoldPnlPercent >= 0 ? "text-green-600" : "text-red-500"}`}
                          >
                            {activeResult.buyAndHoldPnlPercent >= 0 ? "+" : ""}{activeResult.buyAndHoldPnlPercent.toFixed(2)}%
                          </div>
                        </div>
                        <div className='bg-white border border-gray-200 rounded p-3'>
                          <div className='text-gray-500 text-xs mb-1'>Win Rate</div>
                          <div className='text-lg font-bold text-gray-900'>
                            {activeResult.winRate.toFixed(1)}%
                            <span className='text-sm text-gray-500 ml-1'>
                              ({activeResult.winningTrades}W / {activeResult.losingTrades}L)
                            </span>
                          </div>
                        </div>
                        <div className='bg-white border border-gray-200 rounded p-3'>
                          <div className='text-gray-500 text-xs mb-1'>Profit Factor</div>
                          <div
                            className={`text-lg font-bold ${(activeResult.profitFactor ?? 0) >= 1 ? "text-green-600" : "text-red-500"}`}
                          >
                            {activeResult.profitFactor == null ? "N/A" : activeResult.profitFactor === Infinity ? "∞" : activeResult.profitFactor.toFixed(2)}
                          </div>
                        </div>
                        <div className='bg-white border border-gray-200 rounded p-3'>
                          <div className='text-gray-500 text-xs mb-1'>Max Drawdown</div>
                          <div className='text-lg font-bold text-red-500'>
                            -{activeResult.maxDrawdownPercent.toFixed(2)}%
                          </div>
                        </div>
                        <div className='bg-white border border-gray-200 rounded p-3'>
                          <div className='text-gray-500 text-xs mb-1'>Sharpe Ratio</div>
                          <div
                            className={`text-lg font-bold ${activeResult.sharpeRatio >= 1 ? "text-green-600" : activeResult.sharpeRatio >= 0 ? "text-gray-700" : "text-red-500"}`}
                          >
                            {activeResult.sharpeRatio.toFixed(2)}
                          </div>
                        </div>
                      </div>

                      {/* Secondary stats */}
                      <div className='flex items-center justify-between text-sm mt-2'>
                        <div className='flex items-center gap-4'>
                          <div className='text-center'>
                            <span className='text-gray-500 text-xs'>Trades:</span>
                            <span className='ml-1 text-gray-900'>{activeResult.totalTrades}</span>
                          </div>
                          <div className='text-center'>
                            <span className='text-gray-500 text-xs'>Avg Win:</span>
                            <span className='ml-1 text-green-600'>${activeResult.averageWin.toFixed(2)}</span>
                          </div>
                          <div className='text-center'>
                            <span className='text-gray-500 text-xs'>Avg Loss:</span>
                            <span className='ml-1 text-red-500'>-${activeResult.averageLoss.toFixed(2)}</span>
                          </div>
                          <div className='text-center'>
                            <span className='text-gray-500 text-xs'>Alpha vs B&H:</span>
                            <span
                              className={`ml-1 font-bold ${activeResult.totalPnlPercent - activeResult.buyAndHoldPnlPercent >= 0 ? "text-green-600" : "text-red-500"}`}
                            >
                              {activeResult.totalPnlPercent - activeResult.buyAndHoldPnlPercent >= 0 ? "+" : ""}
                              {(activeResult.totalPnlPercent - activeResult.buyAndHoldPnlPercent).toFixed(2)}%
                            </span>
                          </div>
                        </div>
                        <div className='flex items-center gap-3'>
                          <label className='text-gray-500 text-xs cursor-pointer'>
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
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Lambda Readiness Panel */}
                  {activeResult && (
                    <LambdaReadinessPanel
                      result={activeResult}
                      onExport={() => setShowLambdaExport(true)}
                    />
                  )}

                  {/* Charts Container */}
                  <div className='flex flex-col shrink-0'>
                    {/* Price Chart */}
                    <div className='h-[640px]'>
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
                      <div className='flex-1 overflow-y-auto'>
                        <table className='w-full text-xs'>
                          <thead className='bg-gray-50 sticky top-0'>
                            <tr className='text-gray-500'>
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
                                <td className='px-3 py-2 text-gray-500 truncate max-w-[200px]' title={trade.reason}>
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
          </div>
        </div>
      </main>

      {/* Deploy Strategy Modal — fixed overlay, outside main card */}
      <LambdaExportModal
        isOpen={showLambdaExport}
        onClose={() => setShowLambdaExport(false)}
        strategyId={activeResult?.strategyId ?? selectedStrategyId}
        strategyName={
          activeResult?.strategyName
            ?? AVAILABLE_STRATEGIES[activeResult?.strategyId ?? selectedStrategyId]?.name
            ?? selectedStrategyId
        }
        params={activeResult?.params ?? currentParams}
        authToken={authToken}
      />
    </div>
  );
}
