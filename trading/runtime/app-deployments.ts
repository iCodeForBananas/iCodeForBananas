// Deployments published from the backtester (/algo-backtest "Deploy strategy"),
// as opposed to the ones written into trading/deployments.ts. They live in
// Supabase (public.strategy_deployments) and are run by one dispatcher Lambda
// on a 5-minute schedule (runtime/dispatch.ts), so publishing or pausing one
// never needs a CDK deploy. Pure: no AWS imports, shared by the dispatcher, the
// API route that saves them and the tests.

import { deploymentId, resolveDeployment, validateDeployments, type Deployment, type Interval, type ParamValue } from './config';

/** The dispatcher ticks every 5 minutes, so nothing finer than 5-minute bars. */
export const APP_INTERVALS = ['5min', '15min', '30min', '1h', '1d'] as const satisfies readonly Interval[];
export type AppInterval = (typeof APP_INTERVALS)[number];

/** How often EventBridge Scheduler invokes the dispatcher. */
export const TICK_MINUTES = 5;

/** A row of public.strategy_deployments as strategy_deployments_to_run() returns it. */
export interface AppDeploymentRow {
  id: string;
  strategy_id: string;
  symbol: string;
  bar_interval: string;
  params: Record<string, ParamValue> | null;
  enable_shorts: boolean;
  starting_equity: number;
  position_size_pct: number;
  max_daily_loss_pct: number;
  drawdown_limit_pct: number;
  drawdown_pause_bars: number;
  min_bars: number;
  history_days: number;
  enabled: boolean;
  created_at?: string;
}

/** What the backtester sends to publish a deployment. The id is derived, never sent. */
export type AppDeploymentInput = Omit<Required<Deployment>, 'id' | 'enabled'>;

export function rowToDeployment(r: AppDeploymentRow): Deployment {
  return {
    id: r.id,
    strategyId: r.strategy_id,
    symbol: r.symbol,
    interval: r.bar_interval as Interval,
    params: r.params ?? {},
    enabled: r.enabled,
    enableShorts: r.enable_shorts,
    startingEquity: Number(r.starting_equity),
    positionSizePct: Number(r.position_size_pct),
    maxDailyLossPct: Number(r.max_daily_loss_pct),
    drawdownLimitPct: Number(r.drawdown_limit_pct),
    drawdownPauseBars: Number(r.drawdown_pause_bars),
    minBars: Number(r.min_bars),
    historyDays: Number(r.history_days),
  };
}

export function deploymentToRow(d: AppDeploymentInput): Omit<AppDeploymentRow, 'enabled' | 'created_at'> {
  const resolved = resolveDeployment(d);
  return {
    id: deploymentId(d),
    strategy_id: d.strategyId,
    symbol: d.symbol,
    bar_interval: d.interval,
    params: resolved.params,
    enable_shorts: d.enableShorts,
    starting_equity: d.startingEquity,
    position_size_pct: d.positionSizePct,
    max_daily_loss_pct: d.maxDailyLossPct,
    drawdown_limit_pct: d.drawdownLimitPct,
    drawdown_pause_bars: d.drawdownPauseBars,
    min_bars: d.minBars,
    history_days: d.historyDays,
  };
}

/**
 * Every problem with publishing `d` alongside the code deployments, or [].
 * Rejects anything validateDeployments does, an interval finer than the tick,
 * an id a code deployment already uses (they'd report to the same leaderboard
 * row), and a symbol an enabled code deployment trades (one Tradier account
 * holds one net position per symbol). Other app deployments on the symbol are
 * the database's unique index's job.
 */
export function validateAppDeployment(d: Deployment, codeDeployments: Deployment[]): string[] {
  const errors = validateDeployments([d]);
  if (!(APP_INTERVALS as readonly string[]).includes(d.interval)) errors.push(`interval must be one of ${APP_INTERVALS.join(', ')} (the dispatcher runs every ${TICK_MINUTES} minutes)`);
  const id = d.id ?? deploymentId(d);
  const code = codeDeployments.map(resolveDeployment);
  if (code.some((c) => c.id === id)) errors.push(`"${id}" is already deployed from trading/deployments.ts`);
  const owner = code.find((c) => c.enabled && c.symbol === d.symbol);
  if (owner && (d.enabled ?? true)) errors.push(`${d.symbol} is already traded by "${owner.id}" in trading/deployments.ts; one enabled deployment per symbol`);
  return errors;
}
