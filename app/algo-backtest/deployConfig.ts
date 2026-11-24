// The "Deploy strategy" settings: the same literal values the Lambda prompt
// writes (deployPrompt.ts), as a form the backtester can publish straight to
// the dispatcher (trading/runtime/dispatch.ts) instead of as text for an agent.
// Every value is the one the selected run used. What the run can't tell us
// (risk-based sizing, a warmup that couldn't be measured, history that
// doesn't fit) is left blank for the user to fill in before deploying.

import { strategyWarmup } from "@/app/lib/strategyWarmup";
import { LIVE_INTERVALS, historyWindow, riskFields, runtimeLacks, type DeployPromptInput } from "./deployPrompt";

type ParamValue = number | boolean | string;

/** APP_INTERVALS in trading/runtime/app-deployments.ts (which uses node:crypto, so not imported here); the tests check they match. */
export const APP_INTERVALS = ["5min", "15min", "30min", "1h", "1d"] as const;

/** The numeric fields the form edits. */
export const NUMBER_FIELDS = ["startingEquity", "positionSizePct", "maxDailyLossPct", "drawdownLimitPct", "drawdownPauseBars", "minBars", "historyDays"] as const;
export type NumberField = (typeof NUMBER_FIELDS)[number];

export interface DeployDraft {
  strategyId: string;
  /** Null when it can't be deployed at all; see `blockers`. */
  symbol: string | null;
  interval: string | null;
  params: Record<string, ParamValue>;
  enableShorts: boolean;
  /** Null: unknown, the user has to fill it in. */
  numbers: Record<NumberField, number | null>;
  /** Why each null number is unknown. */
  unknown: Partial<Record<NumberField, string>>;
  /** Why it can't be deployed from here at all. */
  blockers: string[];
  /** Backtest features the runtime doesn't have. */
  lacks: string[];
}

export function buildDeployDraft(input: Omit<DeployPromptInput, "source">): DeployDraft {
  const { strategy, run, backtest } = input;
  const timeframe = input.timeframe?.toLowerCase() ?? null;
  const interval = timeframe ? (LIVE_INTERVALS[timeframe] ?? null) : null;
  const blockers: string[] = [];
  const unknown: DeployDraft["unknown"] = {};

  if (!input.symbol) blockers.push("The dataset this result came from isn't known.");
  if (!interval || !(APP_INTERVALS as readonly string[]).includes(interval)) {
    blockers.push(`The run used ${timeframe ?? "unknown"} bars; deployed strategies run on ${APP_INTERVALS.join(", ")} (the scheduler ticks every 5 minutes).`);
  }
  if (!run) blockers.push("The run's settings weren't recorded with this result; run the backtest again.");

  const defs = strategy.parameters ?? [];
  const missing = defs.filter((p) => input.params[p.key] === undefined).map((p) => p.key);
  if (missing.length) blockers.push(`Parameters not recorded with this result: ${missing.join(", ")}.`);
  const params = Object.fromEntries(defs.filter((p) => input.params[p.key] !== undefined).map((p) => [p.key, input.params[p.key]]));

  const numbers: DeployDraft["numbers"] = { startingEquity: null, positionSizePct: null, maxDailyLossPct: null, drawdownLimitPct: null, drawdownPauseBars: null, minBars: null, historyDays: null };
  let enableShorts = false;
  if (run) {
    for (const f of riskFields(run, backtest.initialCapital)) {
      if (f.key === "enableShorts") enableShorts = f.value === "true";
      else if (f.value === null) unknown[f.key as NumberField] = f.unknown;
      else numbers[f.key as NumberField] = Number(f.value);
    }
  }

  const warmup = missing.length ? null : (input.warmup ?? strategyWarmup(strategy, params));
  if (!warmup || warmup.kind === "unknown") {
    unknown.minBars = warmup?.reason ?? "the run's parameters weren't all recorded";
  } else {
    numbers.minBars = warmup.bars;
  }
  if (numbers.minBars !== null && interval) {
    const win = historyWindow(interval, numbers.minBars);
    if (win.fits) numbers.historyDays = win.historyDays;
    else unknown.historyDays = `${numbers.minBars} ${interval} bars don't fit: at most ${win.historyDays} days, which always hold ${win.maxBars}`;
  } else {
    unknown.historyDays = "depends on minBars";
  }

  return {
    strategyId: strategy.id,
    symbol: input.symbol,
    interval,
    params,
    enableShorts,
    numbers,
    unknown,
    blockers,
    lacks: run ? runtimeLacks(run, input.params) : [],
  };
}
