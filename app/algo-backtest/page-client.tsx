"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import BacktestChart from "../components/BacktestChart";
import EquityCurveChart from "../components/EquityCurveChart";
import BentoPageLayout from "../components/BentoPageLayout";
import { Bento } from "../components/ui/bento";
import { Badge, Box, Callout, Checkbox, CheckboxGroup, Code, Flex, Grid, SegmentedControl, Strong, Switch, Table, Text, TextField } from "@radix-ui/themes";
import { Button } from "@/app/components/ui/button";
import { Check, ChevronDown, MessageSquareText, Play, Rocket, Trash2, X } from "lucide-react";
import { cn } from "@/app/lib/utils";
import { IndicatorData, PositionSide } from "@/app/types";
import {
  AVAILABLE_STRATEGIES,
  defaultSweepStep,
  defaultVariation,
  getDefaultParams,
  isWholeNumberParameter,
  ParameterizedResult,
  type StrategyDefinition,
} from "@/app/strategies";
import {
  DEFAULT_SIZING,
  ParameterVariationConfig,
  INITIAL_CAPITAL,
  positionCapPercent,
  SizingSettings,
  stopOffPositionPercent,
  generateSweep,
  type RiskRange,
} from "@/app/lib/backtest-engine";
import { useBacktestWorker, type BacktestJobResult, type StrategyRun } from "./useBacktestWorker";
import { fitsClaudePrefill } from "@/app/lib/claudeLink";
import { clearResultCache, countCachedResults } from "./resultCache";
import { getMeta, queryPage, type ResultRow, type RunMeta } from "./runStore";
import type { RunSettings } from "./deployPrompt";
import { buildDeployDraft, type DeployDraft } from "./deployConfig";
import DeployStrategyDialog, { type BacktestSummary } from "./DeployStrategyDialog";
import { buildReviewPrompt, settingsLines } from "./reviewPrompt";
import BacktestProgressPanel from "./BacktestProgressPanel";
import ResultsBrowser from "./ResultsBrowser";

const DEFAULT_VISIBLE_CANDLES = 300;

// localStorage keys
const STORAGE_KEY_GLOBAL = "algo-backtest-global";
const STORAGE_KEY_STRATEGY_PREFIX = "algo-backtest-strategy-";

// Everything on the page that isn't per strategy, so a refresh comes back to
// the same run setup. Saved values are checked against what exists now (the
// strategy registry, the dataset manifest) on the way back in, so a removed
// strategy or dataset drops out instead of breaking the page.
interface GlobalSettings {
  selectedStrategyId: string;
  showEquityCurve: boolean;
  visibleCandles: number;
  selectedFiles?: string[];
  selectedStrategyIds?: string[];
  expandedStrategyIds?: string[];
  datasetSearch?: string;
  // Commission and slippage describe the market, not a strategy, so every
  // strategy in a run gets the same. Saved here since 2026-11-12; before that
  // they were saved per strategy (see the restore below).
  commissionBps?: number;
  slippageBps?: number;
}

interface StrategySettings {
  currentParams: Record<string, number | boolean | string>;
  paramVariations: ParameterVariationConfig[];
  stopLossPercent: number;
  takeProfitPercent: number;
  enableShorts: boolean;
  // Position sizing (added 2026-05-12 to fix runaway-compounding bug).
  positionSizePercent: number; // % of equity allocated per trade
  // Costs were saved per strategy until 2026-11-12; now they're global
  // (GlobalSettings). Read only to carry an old value over.
  commissionBps?: number;
  slippageBps?: number;
  // Risk sizing and account protection (added 2026-11-04). Settings saved
  // before then have none and get DEFAULT_SIZING; see sizingFrom.
  sizing?: Partial<SizingSettings>;
  // 2 since sweep steps became editable (2026-11-12). Sweeps saved before
  // then carry each parameter's old built-in step, which nobody chose, so
  // they take the current defaults once (see savedVariations).
  sweepStepsVersion?: number;
}

const SWEEP_STEPS_VERSION = 2;

/**
 * A strategy's sweep: the saved one where there is one (old saves get
 * today's default steps), plus defaults for parameters added since.
 */
function savedVariations(strategy: StrategyDefinition, saved: Partial<StrategySettings> | null): ParameterVariationConfig[] {
  const numeric = (strategy.parameters ?? []).filter((p) => p.type === 'number');
  const defaults = numeric.map(defaultVariation);
  if (!saved?.paramVariations || saved.paramVariations.length === 0) return defaults;
  const current = saved.sweepStepsVersion === SWEEP_STEPS_VERSION;
  const kept = saved.paramVariations.flatMap((v) => {
    const p = numeric.find((x) => x.key === v.key);
    if (!p) return [];
    return [current && v.step > 0 ? v : { ...v, step: defaultSweepStep(p) }];
  });
  const keptKeys = new Set(kept.map((v) => v.key));
  return [...kept, ...defaults.filter((v) => !keptKeys.has(v.key))];
}

/** Saved sizing over the defaults, so a field added later still gets a value. */
function sizingFrom(saved: Partial<StrategySettings> | null): SizingSettings {
  // Settings saved before the take profit switch (2026-11-05) had it on
  // whenever the percent was above 0.
  const useTakeProfit = saved?.sizing?.useTakeProfit ?? (saved?.takeProfitPercent ?? 0) > 0;
  // With shorts on, reversal defaults on: without it an always-in strategy (a
  // crossover) closes on the opposite signal and never opens the other side,
  // so it trades only one direction. A saved explicit choice still wins.
  const allowReversal = saved?.sizing?.allowReversal ?? (saved?.enableShorts ?? false);
  return { ...DEFAULT_SIZING, useTakeProfit, ...(saved?.sizing ?? {}), allowReversal };
}

/** One line per sizing setting, for the report. */
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
  // Results cached in IndexedDB (see resultCache.ts); null while unknown or
  // if storage isn't available.
  const [cachedCount, setCachedCount] = useState<number | null>(null);
  const [lastRunCache, setLastRunCache] = useState<BacktestJobResult["cache"] | null>(null);
  const refreshCachedCount = useCallback(() => {
    countCachedResults().then(setCachedCount, () => setCachedCount(null));
  }, []);
  useEffect(refreshCachedCount, [refreshCachedCount]);
  const clearCache = useCallback(async () => {
    await clearResultCache().catch(() => {});
    setLastRunCache(null);
    refreshCachedCount();
  }, [refreshCachedCount]);
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

  // A run's results stay in IndexedDB (see runStore.ts): the page holds the
  // run's meta, the selected result's row, and that one result's trades,
  // equity curve and chart rows. Nothing grows with the size of the run, or
  // with how many results you click through.
  const [runMeta, setRunMeta] = useState<RunMeta | null>(null);
  const [activeRow, setActiveRow] = useState<ResultRow | null>(null);
  const [activeDetail, setActiveDetail] = useState<{
    row: ResultRow;
    trades: ParameterizedResult["trades"];
    equityCurve: ParameterizedResult["equityCurve"];
  } | null>(null);
  const activeResult = useMemo<ParameterizedResult | undefined>(() => {
    if (!activeRow) return undefined;
    const detail = activeDetail?.row === activeRow ? activeDetail : null;
    return { ...activeRow, trades: detail?.trades ?? [], equityCurve: detail?.equityCurve ?? [] };
  }, [activeRow, activeDetail]);
  // This tab's previous run, deleted when the next one starts.
  const lastRunIdRef = useRef<string | undefined>(undefined);
  // The per-strategy settings the last run used, to re-run any one result.
  const lastRunsRef = useRef<StrategyRun[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Selected trade for chart highlighting
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);

  // Copy report state
  const [copied, setCopied] = useState(false);
  // "Deploy strategy": the dialog's draft, built from the active result's run.
  const [deploy, setDeploy] = useState<{ strategy: StrategyDefinition; draft: DeployDraft; backtest: BacktestSummary } | null>(null);

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
  const [sizing, setSizing] = useState<SizingSettings>(DEFAULT_SIZING);
  const updateSizing = useCallback((patch: Partial<SizingSettings>) => {
    setSizing((prev) => ({ ...prev, ...patch }));
  }, []);

  // Web Worker — owns all backtest compute. Replaces /api/backtest, which was
  // OOMing on Vercel (1.8 GB lambda heap) under multi-strategy / wide sweeps.
  const {
    run: runBacktestWorker,
    detail: runBacktestDetail,
    cancel: cancelBacktest,
    progress: backtestProgress,
  } = useBacktestWorker();

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

  const combinationCount = useMemo(() => generateSweep(paramVariations, sizing).length, [paramVariations, sizing]);

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
      setParamVariations(savedVariations(strategy, saved));
    } else {
      setParamVariations([]);
    }

    // Restore risk management settings for this strategy
    if (saved) {
      setStopLossPercent(saved.stopLossPercent ?? 1);
      setTakeProfitPercent(saved.takeProfitPercent ?? 0);
      setEnableShorts(saved.enableShorts ?? false);
      setPositionSizePercent(saved.positionSizePercent ?? 100);
      setSizing(sizingFrom(saved));
    } else {
      setStopLossPercent(1);
      setTakeProfitPercent(0);
      setEnableShorts(false);
      setPositionSizePercent(100);
      setSizing(DEFAULT_SIZING);
    }
  }, [selectedStrategyId]);

  // Restore the page's settings on mount. Saving waits until this has run
  // (settingsRestored), or the first render's empty selections would
  // overwrite what was saved before they're read back.
  const [settingsRestored, setSettingsRestored] = useState(false);
  useEffect(() => {
    const saved = loadGlobalSettings();
    const known = (ids: unknown) =>
      Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string" && id in AVAILABLE_STRATEGIES) : [];
    if (saved?.selectedStrategyId && AVAILABLE_STRATEGIES[saved.selectedStrategyId]) {
      setSelectedStrategyId(saved.selectedStrategyId);
    }
    // Costs: the global value, else what the selected strategy had saved
    // when costs were per strategy, else none.
    const legacy = loadStrategySettings(saved?.selectedStrategyId ?? "ema-crossover");
    const cost = (v: unknown, old: unknown) => (typeof v === "number" && v >= 0 ? v : typeof old === "number" && old >= 0 ? old : 0);
    setCommissionBps(cost(saved?.commissionBps, legacy?.commissionBps));
    setSlippageBps(cost(saved?.slippageBps, legacy?.slippageBps));
    if (saved?.showEquityCurve !== undefined) setShowEquityCurve(saved.showEquityCurve);
    if (saved?.visibleCandles !== undefined) setVisibleCandles(saved.visibleCandles);
    setSelectedStrategyIds(known(saved?.selectedStrategyIds));
    setExpandedStrategyIds(known(saved?.expandedStrategyIds));
    // Pruned to files that still exist once the manifest loads.
    if (Array.isArray(saved?.selectedFiles)) setSelectedFiles(saved.selectedFiles.filter((f) => typeof f === "string"));
    if (typeof saved?.datasetSearch === "string") setDatasetSearch(saved.datasetSearch);
    setSettingsRestored(true);
  }, []);

  useEffect(() => {
    async function fetchDatasets() {
      try {
        // A static listing, written next to the CSVs by scripts/lib/data-manifest.mjs.
        const response = await fetch("/data/manifest.json");
        const result = await response.json();
        if (result.files?.length > 0) {
          setAvailableDatasets(result.files);
          const exists = new Set((result.files as DatasetInfo[]).map((d) => d.file));
          setSelectedFiles((prev) => prev.filter((f) => exists.has(f)));
        }
      } catch (err) {
        console.error("Error fetching datasets:", err);
      }
    }
    fetchDatasets();
  }, []);

  // Save global settings when any global preference changes
  useEffect(() => {
    if (!settingsRestored) return;
    saveGlobalSettings({
      selectedStrategyId,
      showEquityCurve,
      visibleCandles,
      selectedFiles,
      selectedStrategyIds,
      expandedStrategyIds,
      datasetSearch,
      commissionBps,
      slippageBps,
    });
  }, [settingsRestored, selectedStrategyId, showEquityCurve, visibleCandles, selectedFiles, selectedStrategyIds, expandedStrategyIds, datasetSearch, commissionBps, slippageBps]);

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
      sizing,
      sweepStepsVersion: SWEEP_STEPS_VERSION,
    });
  }, [selectedStrategyId, currentParams, paramVariations, stopLossPercent, takeProfitPercent, enableShorts, positionSizePercent, sizing]);

  // Build a StrategyRun for one strategy from saved per-strategy settings,
  // falling back to defaults if it has never been edited.
  const buildSavedRun = useCallback((strategyId: string) => {
    const strat = AVAILABLE_STRATEGIES[strategyId];
    if (!strat) return null;
    const saved = loadStrategySettings(strategyId);
    const defaults = getDefaultParams(strategyId);
    const params = { ...defaults };
    for (const key of Object.keys(defaults)) {
      if (saved?.currentParams && key in saved.currentParams) params[key] = saved.currentParams[key];
    }

    const variations: ParameterVariationConfig[] = strat.parameters ? savedVariations(strat, saved) : [];

    return {
      strategyId,
      currentParams: params,
      paramVariations: variations,
      stopLossPercent: saved?.stopLossPercent ?? 1,
      takeProfitPercent: saved?.takeProfitPercent ?? 0,
      enableShorts: saved?.enableShorts ?? false,
      positionSizePercent: saved?.positionSizePercent ?? 100,
      // Costs are the market's, the same for every strategy in the run.
      commissionBps,
      slippageBps,
      sizing: sizingFrom(saved),
    };
  }, [commissionBps, slippageBps]);

  // Run batch backtest with parameter variations against all selected datasets.
  //
  // Compute happens in a Web Worker on the user's machine (see backtest.worker.ts).
  // The worker fetches CSVs from /data (static files) and runs the entire indicator + backtest
  // pipeline off the main thread, so the UI stays responsive and we don't hit
  // Vercel's lambda memory/time limits.
  const runBatchBacktest = useCallback(async () => {
    if (selectedFiles.length === 0 || selectedStrategyIds.length === 0) return;
    setIsRunningBatch(true);
    setError(null);
    setRunMeta(null);
    setActiveRow(null);
    setActiveDetail(null);
    setIndicatorData([]);
    setSelectedTradeId(null);

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
            sizing,
          };
        }
        return buildSavedRun(sid);
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    lastRunsRef.current = perStrategyRuns;

    try {
      const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const discardRunId = lastRunIdRef.current;
      lastRunIdRef.current = runId;
      const { failedDatasets, unreachable, cache } = await runBacktestWorker(selectedFiles, perStrategyRuns, runId, discardRunId);
      setLastRunCache(cache);
      refreshCachedCount();

      // Open on the run's best result by P&L, read back from IndexedDB.
      const [meta, { rows }] = await Promise.all([
        getMeta(runId),
        queryPage({ runId, field: "totalPnlPercent", direction: "desc", beatsBuyHold: false, limit: 1 }),
      ]);
      setRunMeta(meta ?? null);
      setActiveRow(rows[0] ?? null);
      playDing();

      if (unreachable) {
        // One cause, not a list of identical per-file errors.
        const loaded = selectedFiles.length - failedDatasets.length;
        setError(
          `Couldn't reach the server, so ${failedDatasets.length} of ${selectedFiles.length} dataset(s) didn't load` +
            `${loaded > 0 ? ` (results below cover the other ${loaded})` : ""}. ` +
            "Check that the dev server is running, or your connection, and run again.",
        );
      } else if (failedDatasets.length > 0) {
        setError(`Failed to load ${failedDatasets.length} dataset(s): ${failedDatasets.join("; ")}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Backtest failed";
      if (msg !== "Cancelled") setError(msg);
    } finally {
      setIsRunningBatch(false);
    }
  }, [selectedFiles, selectedStrategyIds, selectedStrategyId, paramVariations, currentParams, stopLossPercent, takeProfitPercent, enableShorts, positionSizePercent, commissionBps, slippageBps, sizing, buildSavedRun, runBacktestWorker, refreshCachedCount]);

  // The settings the run that produced the active result used; the editor's
  // only when that run isn't in this tab (it always is once a run finishes).
  // The report and the review prompt both describe exactly these.
  const activeResultRun = useCallback((): RunSettings | null => {
    const result = activeResult;
    if (!result) return null;
    const resultStrategyId = result.strategyId ?? selectedStrategyId;
    const recorded = lastRunsRef.current.find((r) => r.strategyId === resultStrategyId);
    if (recorded) return recorded;
    const isActiveEditorStrategy = resultStrategyId === selectedStrategyId;
    const saved = isActiveEditorStrategy ? null : loadStrategySettings(resultStrategyId);
    return {
      stopLossPercent: isActiveEditorStrategy ? stopLossPercent : (saved?.stopLossPercent ?? 1),
      takeProfitPercent: isActiveEditorStrategy ? takeProfitPercent : (saved?.takeProfitPercent ?? 0),
      enableShorts: isActiveEditorStrategy ? enableShorts : (saved?.enableShorts ?? false),
      positionSizePercent: isActiveEditorStrategy ? positionSizePercent : (saved?.positionSizePercent ?? 100),
      commissionBps,
      slippageBps,
      sizing: isActiveEditorStrategy ? sizing : sizingFrom(saved),
    };
  }, [activeResult, selectedStrategyId, stopLossPercent, takeProfitPercent, enableShorts, positionSizePercent, commissionBps, slippageBps, sizing]);

  // Generate markdown report for clipboard
  const generateMarkdownReport = useCallback((includeTrades = true) => {
    const result = activeResult;
    const run = activeResultRun();
    if (!result || !run) return '';
    // Prefer the strategy this result was actually generated from. Falls back
    // to the active editor when the API did not tag the result (legacy runs).
    const resultStrategyId = result.strategyId ?? selectedStrategyId;
    const strat = AVAILABLE_STRATEGIES[resultStrategyId];
    if (!strat) return '';

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
      ...(result.outOfSamplePnlPercent !== undefined
        ? [`- **In-sample (first 70% of bars):** ${(result.inSamplePnlPercent ?? 0).toFixed(2)}%; **out-of-sample (last 30%):** ${result.outOfSamplePnlPercent.toFixed(2)}% vs buy & hold ${(result.outOfSampleBuyAndHoldPercent ?? 0).toFixed(2)}%`]
        : []),
      ...settingsLines(run, result.params ?? {}),
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

    if (includeTrades && result.trades.length > 0) {
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
  }, [activeResult, activeResultRun, selectedStrategyId, selectedFiles, availableDatasets, currentParams]);

  // Open the report in a new Claude chat, asking whether it's worth running
  // live. The whole report rides in the chat's ?q= prefill when it fits; a
  // long trade log doesn't, so then the prefill carries the report without it
  // and the full report goes to the clipboard to paste in after.
  const reviewWithClaude = useCallback(async () => {
    const full = generateMarkdownReport(true);
    const run = activeResultRun();
    if (!full || !run) return;
    const reviewPrompt = buildReviewPrompt(run, activeResult?.params ?? {});
    const fits = fitsClaudePrefill;
    let message = `${reviewPrompt}\n\n${full}`;
    let trimmed = false;
    if (!fits(message)) {
      trimmed = true;
      message = `${reviewPrompt}\n\nThe full trade log is on my clipboard; I'll paste it in my next message.\n\n${generateMarkdownReport(false)}`;
      if (!fits(message)) message = `${reviewPrompt}\n\nThe full report is on my clipboard; I'll paste it in my next message.`;
    }
    // Open first, inside the click, so a popup blocker allows it.
    window.open(`https://claude.ai/new?q=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    if (trimmed) {
      try {
        await navigator.clipboard.writeText(full);
      } catch {
        alert('Opened Claude, but the full report could not be copied. Check your browser clipboard permissions.');
        return;
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [generateMarkdownReport, activeResultRun, activeResult]);

  // Open "Deploy strategy" with the settings of the run that produced this result.
  const openDeploy = useCallback(() => {
    const result = activeResult;
    if (!result) return;
    const resultStrategyId = result.strategyId ?? selectedStrategyId;
    const strat = AVAILABLE_STRATEGIES[resultStrategyId];
    if (!strat) return;
    const run = lastRunsRef.current.find((r) => r.strategyId === resultStrategyId) ?? null;
    const dataset = availableDatasets.find((d) => d.file === result.dataset);
    const backtest = {
      label: result.datasetLabel ?? dataset?.label ?? 'n/a',
      totalPnlPercent: result.totalPnlPercent,
      totalTrades: result.totalTrades,
      winRate: result.winRate,
      maxDrawdownPercent: result.maxDrawdownPercent,
      sharpeRatio: result.sharpeRatio,
    };
    const draft = buildDeployDraft({
      strategy: strat,
      params: result.params ?? {},
      run,
      symbol: dataset?.symbol ?? null,
      timeframe: dataset?.timeframe ?? null,
      backtest: { ...backtest, initialCapital: INITIAL_CAPITAL },
    });
    setDeploy({ strategy: strat, draft, backtest });
  }, [activeResult, selectedStrategyId, availableDatasets]);

  // Backtest only runs on explicit button click ("Run N Variations") — no auto-run on file or param change.

  // Load the selected result's trades, equity curve and chart rows. Only the
  // selected one is held; picking another drops the old one first, so a
  // whole dataset's chart rows are never held twice while the next loads.
  useEffect(() => {
    if (!activeRow?.dataset) return;
    const run = lastRunsRef.current.find((r) => r.strategyId === activeRow.strategyId);
    if (!run) return;
    let stale = false;
    setActiveDetail(null);
    setIndicatorData([]);
    setDetailLoading(true);
    runBacktestDetail(activeRow.dataset, run, activeRow.params)
      .then(({ result, indicatorData: rows }) => {
        if (stale) return;
        setActiveDetail({ row: activeRow, trades: result.trades, equityCurve: result.equityCurve });
        setIndicatorData(rows);
        setDetailLoading(false);
      })
      .catch((err: unknown) => {
        if (stale) return;
        setDetailLoading(false);
        console.error("Failed to load result detail:", err);
      });
    return () => {
      stale = true;
    };
  }, [activeRow, runBacktestDetail]);

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
          totalRuns += generateSweep(saved.paramVariations, saved.sizing).length;
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
                    size='sm'
                    variant='ghost'
                    onClick={() => setSelectedFiles((prev) => [...new Set([...prev, ...filteredDatasets.map((ds) => ds.file)])])}
                    title={datasetSearch ? "Select every dataset matching the search" : "Select every dataset"}
                  >
                    All
                  </Button>
                  <Button
                    size='sm'
                    variant='ghost'
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
                          size='sm'
                          variant={allSelected ? "primary" : "secondary"}
                          onClick={() => toggleTimeframe(tf)}
                          aria-pressed={allSelected}
                        >
                          {tf.toUpperCase()}
                        </Button>
                      );
                    })}
                  </Flex>
                )}
                <div className='overflow-y-auto overscroll-contain' style={{ maxHeight: 176 }}>
                  <CheckboxGroup.Root size='1' value={selectedFiles} onValueChange={setSelectedFiles} className='gap-1 pr-3'>
                    {filteredDatasets.map((ds) => (
                      <CheckboxGroup.Item key={ds.file} value={ds.file}>
                        {ds.label}
                      </CheckboxGroup.Item>
                    ))}
                  </CheckboxGroup.Root>
                </div>
                {selectedFiles.length === 0 ? (
                  <Text size='1' color='gray'>
                    Pick at least one dataset.
                  </Text>
                ) : (
                  // Everything that will run, including anything the search is
                  // hiding, so a selection can never be invisible.
                  <Flex wrap='wrap' gap='1' aria-label='Selected datasets'>
                    {selectedFiles.map((file) => (
                      <Badge key={file} variant='soft' className='gap-1 pr-1'>
                        {availableDatasets.find((ds) => ds.file === file)?.label ?? file}
                        <Button
                          size='icon-sm'
                          variant='ghost'
                          aria-label={`Remove ${availableDatasets.find((ds) => ds.file === file)?.label ?? file}`}
                          onClick={() => setSelectedFiles((prev) => prev.filter((f) => f !== file))}
                          className='m-0 h-4 w-4 min-w-0'
                        >
                          <X className='h-3 w-3' />
                        </Button>
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
                    size='sm'
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
              <div className='overflow-y-auto overscroll-contain' style={{ maxHeight: 280 }}>
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
                            <Button
                              size='icon-sm'
                              variant='ghost'
                              onClick={toggleExpand}
                              aria-label={isExpanded ? `Collapse ${s.name} settings` : `Expand ${s.name} settings`}
                              aria-expanded={isExpanded}
                            >
                              <ChevronDown className={cn("size-4 transition-transform", isExpanded && "rotate-180")} />
                            </Button>
                          )}
                        </Flex>

                        {isExpanded && hasParams && (
                          <Box ml='4' pl='3' py='2' className='border-l-2 border-line-strong'>
                            {isActive ? (
                              <Flex wrap='wrap' gap='3'>
                                {numericParams.map((param) => {
                                  const variation = paramVariations.find((v) => v.key === param.key);
                                  const step = variation?.step ?? defaultSweepStep(param);
                                  const setBound = (bound: "min" | "max" | "step", raw: string) => {
                                    const parsed = parseFloat(raw);
                                    const fallback = bound === "step" ? defaultSweepStep(param) : Number(param[bound] ?? param.default);
                                    // A step has to move forward, or the sweep never ends.
                                    const value = isNaN(parsed) || (bound === "step" && parsed <= 0) ? fallback : parsed;
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
                                          step={step}
                                          onChange={(raw) => setBound("min", raw)}
                                          className='w-20'
                                        />
                                        <Text size='1' color='gray' className='pb-2'>
                                          →
                                        </Text>
                                        <NumberField
                                          label='Max'
                                          value={variation?.max ?? param.max ?? Number(param.default)}
                                          min={param.min}
                                          max={param.max}
                                          step={step}
                                          onChange={(raw) => setBound("max", raw)}
                                          className='w-20'
                                        />
                                        <Text size='1' color='gray' className='pb-2'>
                                          by
                                        </Text>
                                        <NumberField
                                          label='Step'
                                          value={step}
                                          min={isWholeNumberParameter(param) ? 1 : 0.01}
                                          step={isWholeNumberParameter(param) ? 1 : 0.01}
                                          onChange={(raw) => setBound("step", raw)}
                                          className='w-16'
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
                                  const step = variation?.step ?? defaultSweepStep(param);
                                  return (
                                    <Flex key={param.key} direction='column' gap='1'>
                                      <Text size='1' weight='medium'>
                                        {param.name}
                                      </Text>
                                      <Code size='1' variant='ghost' color='gray'>
                                        {min !== max ? `${min} → ${max} by ${step}` : String(min)}
                                      </Code>
                                    </Flex>
                                  );
                                })}
                                <Button size='sm' variant='ghost' onClick={() => setSelectedStrategyId(s.id)}>
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
              </div>
            </Bento>

            <Bento title='Risk'>
              <Flex direction='column' gap='3'>
                {/* Off means off: no percent stop and no ATR stop, so the
                    strategy's own signals are the only exits. See
                    SizingSettings.useStopLoss in backtest-engine. */}
                <Text as='label' size='2'>
                  <Flex gap='2' align='center'>
                    <Switch
                      size='1'
                      checked={sizing.useStopLoss}
                      onCheckedChange={(on) => updateSizing({ useStopLoss: on })}
                    />
                    Stop loss
                  </Flex>
                </Text>
                {sizing.useStopLoss ? (
                  <>
                    <Flex wrap='wrap' gap='3'>
                      {/* A range on the ATR stop replaces its one multiple; the
                          percent stays as the ATR warm-up fallback. */}
                      {!(sizing.stopLossRange && sizing.atrStopMultiple > 0) && (
                        <NumberField
                          label='ATR stop ×'
                          value={sizing.atrStopMultiple}
                          min={0}
                          step={0.5}
                          placeholder='0 = use %'
                          onChange={(raw) => {
                            const v = parseFloat(raw);
                            updateSizing({ atrStopMultiple: isNaN(v) ? 0 : Math.max(0, v) });
                          }}
                        />
                      )}
                      {!(sizing.stopLossRange && sizing.atrStopMultiple <= 0) && (
                        <NumberField
                          label={sizing.atrStopMultiple > 0 ? 'Stop loss % (ATR warm-up)' : 'Stop loss %'}
                          value={stopLossPercent}
                          min={0}
                          step={0.5}
                          placeholder='0 = none'
                          onChange={(raw) => {
                            const v = parseFloat(raw);
                            setStopLossPercent(isNaN(v) ? 0 : Math.max(0, v));
                          }}
                        />
                      )}
                    </Flex>
                    <RiskRangeFields
                      label={sizing.atrStopMultiple > 0 ? 'Test a range of ATR stops (×)' : 'Test a range of stops (%)'}
                      range={sizing.stopLossRange ?? null}
                      fallback={sizing.atrStopMultiple > 0 ? { min: 1, max: 4, step: 0.5 } : { min: 0.5, max: 5, step: 0.5 }}
                      onChange={(stopLossRange) => updateSizing({ stopLossRange })}
                    />
                  </>
                ) : (
                  <Text size='1' color='gray'>
                    Off. The strategy&apos;s own signals are the only entries and exits
                    {sizing.maxDrawdownPercent > 0 ? ', apart from the account drawdown limit below' : ''}.
                  </Text>
                )}
                <Text as='label' size='2'>
                  <Flex gap='2' align='center'>
                    <Switch
                      size='1'
                      checked={sizing.useTakeProfit}
                      onCheckedChange={(on) => {
                        updateSizing({ useTakeProfit: on });
                        if (on && takeProfitPercent <= 0) setTakeProfitPercent(5);
                      }}
                    />
                    Take profit
                  </Flex>
                </Text>
                {sizing.useTakeProfit && (
                  <>
                    {!sizing.takeProfitRange && (
                      <Flex wrap='wrap' gap='3'>
                        <NumberField
                          label='Take profit %'
                          value={takeProfitPercent}
                          min={0}
                          step={0.5}
                          onChange={(raw) => {
                            const v = parseFloat(raw);
                            setTakeProfitPercent(isNaN(v) ? 0 : Math.max(0, v));
                          }}
                        />
                      </Flex>
                    )}
                    <RiskRangeFields
                      label='Test a range of take profits (%)'
                      range={sizing.takeProfitRange ?? null}
                      fallback={{ min: 2, max: 10, step: 1 }}
                      onChange={(takeProfitRange) => updateSizing({ takeProfitRange })}
                    />
                  </>
                )}
                {/* Risk sizing derives each trade's size from the stop: a
                    stop fill costs the risk %. Fixed is the old "x% of
                    equity" sizing. With no stop, risk sizing has nothing to
                    size from and goes all in. */}
                <SegmentedControl.Root
                  size='1'
                  aria-label='Position sizing'
                  value={sizing.mode}
                  onValueChange={(v) => updateSizing({ mode: v as SizingSettings['mode'] })}
                >
                  <SegmentedControl.Item value='risk'>Risk per trade</SegmentedControl.Item>
                  <SegmentedControl.Item value='fixed'>Fixed size</SegmentedControl.Item>
                </SegmentedControl.Root>
                {sizing.mode === 'risk' && !sizing.useStopLoss ? (
                  <Text size='2'>
                    Position size: <Strong>100% of equity (no stop)</Strong>
                  </Text>
                ) : (
                  <Flex wrap='wrap' gap='3'>
                    {sizing.mode === 'risk' ? (
                      <>
                        <NumberField
                          label='Risk per trade %'
                          value={sizing.riskPercent}
                          min={0}
                          step={0.25}
                          onChange={(raw) => {
                            const v = parseFloat(raw);
                            updateSizing({ riskPercent: isNaN(v) ? 0 : Math.max(0, v) });
                          }}
                        />
                        <NumberField
                          label='Max position %'
                          value={sizing.maxPositionPercent}
                          min={0}
                          max={100}
                          step={5}
                          onChange={(raw) => {
                            const v = parseFloat(raw);
                            updateSizing({ maxPositionPercent: isNaN(v) ? 100 : Math.max(0, Math.min(100, v)) });
                          }}
                        />
                      </>
                    ) : (
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
                    )}
                  </Flex>
                )}
                {/* A stop can't catch a gap; only size can bound what one
                    costs. It's part of the stop-based protection, so it's
                    off with the stop. */}
                {sizing.useStopLoss && (
                  <Flex wrap='wrap' gap='3'>
                    <NumberField
                      label='Max loss to a gap %'
                      value={sizing.maxGapLossPercent}
                      min={0}
                      step={1}
                      placeholder='0 = off'
                      onChange={(raw) => {
                        const v = parseFloat(raw);
                        updateSizing({ maxGapLossPercent: isNaN(v) ? 0 : Math.max(0, v) });
                      }}
                    />
                    <NumberField
                      label='Gap to plan for %'
                      value={sizing.gapShockPercent}
                      min={1}
                      step={5}
                      onChange={(raw) => {
                        const v = parseFloat(raw);
                        updateSizing({ gapShockPercent: isNaN(v) ? 20 : Math.max(1, v) });
                      }}
                    />
                  </Flex>
                )}
                <Flex wrap='wrap' gap='3'>
                  <NumberField
                    label='Max drawdown %'
                    value={sizing.maxDrawdownPercent}
                    min={0}
                    step={5}
                    placeholder='0 = off'
                    onChange={(raw) => {
                      const v = parseFloat(raw);
                      updateSizing({ maxDrawdownPercent: isNaN(v) ? 0 : Math.max(0, Math.min(100, v)) });
                    }}
                  />
                  <NumberField
                    label='Then sit out (bars)'
                    value={sizing.drawdownPauseBars}
                    min={0}
                    step={5}
                    placeholder='0 = stop'
                    onChange={(raw) => {
                      const v = parseInt(raw, 10);
                      updateSizing({ drawdownPauseBars: isNaN(v) ? 0 : Math.max(0, v) });
                    }}
                  />
                </Flex>
                <Text size='1' color='gray'>
                  {!sizing.useStopLoss
                    ? `Every trade puts ${stopOffPositionPercent(sizing, positionSizePercent)}% of the account in and stays in until the strategy exits.`
                    : sizing.mode === 'risk'
                      ? `A stop fill costs ${sizing.riskPercent}% of the account.`
                      : `Every trade puts ${Math.min(positionSizePercent, positionCapPercent(sizing))}% of the account in.`}{' '}
                  {!sizing.useStopLoss
                    ? `A ${sizing.gapShockPercent}% gap would cost ${+((stopOffPositionPercent(sizing, positionSizePercent) * sizing.gapShockPercent) / 100).toFixed(1)}% of the account.`
                    : sizing.maxGapLossPercent > 0
                      ? `Positions stay under ${+positionCapPercent(sizing).toFixed(1)}% of the account, so a ${sizing.gapShockPercent}% gap costs at most ${sizing.maxGapLossPercent}%.`
                      : `No gap cap: a ${sizing.gapShockPercent}% gap could cost up to ${+(((sizing.mode === 'risk' ? sizing.maxPositionPercent : positionSizePercent) * sizing.gapShockPercent) / 100).toFixed(1)}% of the account.`}
                </Text>
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
                    <Switch
                      size='1'
                      checked={enableShorts}
                      onCheckedChange={(on) => {
                        setEnableShorts(on);
                        // Turning shorts on turns reversal on with them; see sizingFrom.
                        if (on) updateSizing({ allowReversal: true });
                      }}
                    />
                    Enable shorts
                  </Flex>
                </Text>
                {/* Off, an exit only closes: the chart never shows one trade
                    ending and the next starting on the same candle. */}
                <Text as='label' size='2'>
                  <Flex gap='2' align='center'>
                    <Switch
                      size='1'
                      checked={sizing.allowReversal ?? false}
                      onCheckedChange={(on) => updateSizing({ allowReversal: on })}
                    />
                    Reverse on an opposite signal
                  </Flex>
                </Text>
                <Text size='1' color='gray'>
                  {sizing.allowReversal
                    ? 'An exit whose bar also signals the other side closes and reopens at the same next open.'
                    : enableShorts
                      ? 'An exit only closes; the next trade waits for a later bar. Crossover strategies will trade only one side.'
                      : 'An exit only closes; the next trade waits for a later bar.'}
                </Text>
              </Flex>
            </Bento>
          </Grid>

          <Flex justify='end' align='center' gap='3' wrap='wrap'>
            {/* Variations that have run before, against the same data with
                the same code and settings, come back from IndexedDB instead
                of running again. */}
            {cachedCount !== null && (
              <Flex align='center' gap='2' className='mr-auto'>
                <Text size='1' color='gray'>
                  {cachedCount.toLocaleString()} cached {cachedCount === 1 ? 'result' : 'results'}
                  {lastRunCache && lastRunCache.enabled && (
                    <> · last run {lastRunCache.hits.toLocaleString()} of {lastRunCache.total.toLocaleString()} from cache</>
                  )}
                  {lastRunCache && !lastRunCache.enabled && <> · caching unavailable</>}
                </Text>
                <Button
                  size='sm'
                  variant='ghost'
                  onClick={() => void clearCache()}
                  disabled={isRunningBatch || cachedCount === 0}
                >
                  <Trash2 className='size-3.5' />
                  Clear cache
                </Button>
              </Flex>
            )}
            <Button variant="primary"
              size='lg'
              onClick={runBatchBacktest}
              disabled={isRunningBatch || selectedFiles.length === 0 || selectedStrategyIds.length === 0}
              className='w-full sm:w-auto'
            >
              <Play className='size-4' />
              {runLabel}
            </Button>
          </Flex>

          {/* ── Results ───────────────────────────────────────────── */}
          {!runMeta ? (
            <Flex align='center' justify='center' py='9'>
              <Text size='2' color='gray'>
                Run a backtest to see results.
              </Text>
            </Flex>
          ) : (
            <Flex direction='column' gap='3' className='min-w-0'>
              {activeResult && (
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
                        size='sm'
                        variant="secondary"
                        onClick={reviewWithClaude}
                        title='Open this report in Claude and ask whether it is viable to run as a live paper-trading deployment'
                      >
                        {copied ? <Check className='size-3.5' /> : <MessageSquareText className='size-3.5' />}
                        {copied ? "Opened in Claude" : "Review with Claude"}
                      </Button>
                      <Button
                        size='sm'
                        variant="primary"
                        onClick={openDeploy}
                        title='Paper-trade this result on Tradier: the dispatcher Lambda runs it every bar, no CDK deploy'
                      >
                        <Rocket className='size-3.5' />
                        Deploy strategy
                      </Button>
                    </Flex>
                  </Flex>
                </>
              )}

              <div className='grid grid-cols-[minmax(0,1fr)] gap-3 lg:h-[calc(100dvh-2rem)] lg:min-h-[560px] lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]'>
                <div className='h-[50dvh] min-h-0 lg:h-auto'>
                  <ResultsBrowser
                    meta={runMeta}
                    active={activeRow}
                    onSelect={(row) => {
                      setActiveRow(row);
                      setSelectedTradeId(null);
                    }}
                    datasetLabel={(file) => availableDatasets.find((d) => d.file === file)?.label ?? file}
                  />
                </div>
                <div className='h-[80dvh] min-h-0 lg:h-auto'>
                  <Bento
                    fill
                    title={
                      activeResult
                        ? [
                            activeResult.strategyName,
                            activeResult.dataset &&
                              (availableDatasets.find((d) => d.file === activeResult.dataset)?.label ?? activeResult.dataset),
                          ]
                            .filter(Boolean)
                            .join(" · ") || "Chart"
                        : "Chart"
                    }
                    actions={
                      activeResult && (
                        <Text size='1' color='gray'>
                          {activeResult.totalTrades} trades
                        </Text>
                      )
                    }
                    bodyClassName='flex flex-col p-0 overflow-hidden'
                  >
                    <div className='relative min-h-[240px] flex-1'>
                      <BacktestChart
                        data={indicatorData}
                        trades={chartTrades}
                        visibleCandles={visibleCandles}
                        onVisibleCandlesChange={setVisibleCandles}
                        selectedStrategyId={activeResult?.strategyId ?? selectedStrategyId}
                        currentParams={activeResult?.params ?? currentParams}
                        selectedTradeId={selectedTradeId}
                      />
                      {detailLoading && (
                        <Flex
                          align='center'
                          justify='center'
                          className='absolute inset-0 z-20 bg-[var(--color-panel-translucent)] backdrop-blur-sm'
                        >
                          <Text size='2' color='gray'>
                            Loading trades…
                          </Text>
                        </Flex>
                      )}
                    </div>
                    {showEquityCurve && activeResult && activeResult.equityCurve.length > 0 && (
                      <div className='h-40 shrink-0 border-t border-line-subtle'>
                        <EquityCurveChart equityCurve={activeResult.equityCurve} initialCapital={INITIAL_CAPITAL} />
                      </div>
                    )}
                  </Bento>
                </div>
              </div>

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
      {deploy && <DeployStrategyDialog strategy={deploy.strategy} draft={deploy.draft} backtest={deploy.backtest} onClose={() => setDeploy(null)} />}
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
/**
 * A switch that turns one stop or target value into a range the run sweeps,
 * with from / to / step fields while it's on. Each value becomes its own
 * result, sharing the run's cap on variations with the strategy parameters.
 */
function RiskRangeFields({
  label,
  range,
  fallback,
  onChange,
}: {
  label: string;
  range: RiskRange | null;
  fallback: RiskRange;
  onChange: (range: RiskRange | null) => void;
}) {
  const set = (key: keyof RiskRange, raw: string) => {
    const v = parseFloat(raw);
    if (!range) return;
    onChange({ ...range, [key]: isNaN(v) ? fallback[key] : Math.max(key === 'step' ? 0.01 : 0, v) });
  };
  const count = range && range.step > 0 && range.max >= range.min ? Math.floor((range.max - range.min) / range.step + 1e-9) + 1 : 0;
  return (
    <Flex direction='column' gap='2'>
      <Text as='label' size='1'>
        <Flex gap='2' align='center'>
          <Switch size='1' checked={!!range} onCheckedChange={(on) => onChange(on ? fallback : null)} />
          {label}
        </Flex>
      </Text>
      {range && (
        <>
          <Flex wrap='wrap' gap='3'>
            <NumberField label='From' value={range.min} min={0} step={0.5} onChange={(raw) => set('min', raw)} />
            <NumberField label='To' value={range.max} min={0} step={0.5} onChange={(raw) => set('max', raw)} />
            <NumberField label='Step' value={range.step} min={0.01} step={0.25} onChange={(raw) => set('step', raw)} />
          </Flex>
          <Text size='1' color='gray'>
            {count > 0
              ? `${count} value${count === 1 ? '' : 's'}, each run with every parameter variation`
              : 'From must not be above To'}
          </Text>
        </>
      )}
    </Flex>
  );
}

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
