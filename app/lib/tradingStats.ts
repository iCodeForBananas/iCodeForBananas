// Statistics on the live paper-trading deployments, for the MCP server's
// get_trading_stats tool (app/api/mcp/route.ts): what each one trades, how it
// has done since it started reporting, and its daily returns, so Claude can
// analyze them. Built from the same rows /trading-leaderboard reads. Pure.

import { deploymentDetails } from "./deploymentDetails";
import { STARTING_CAPITAL, summarize, type EquityCurveRow, type EquityPoint } from "./tradingEquity";

export interface DailyStats {
  /** Trading days with a closing value, including the first. */
  days: number;
  /** Day-over-day returns, in percent. */
  meanDailyReturnPct: number | null;
  stdevDailyReturnPct: number | null;
  bestDayPct: number | null;
  worstDayPct: number | null;
  /** Share of days that closed up, in percent. */
  upDaysPct: number | null;
  /** Mean over standard deviation of daily returns, times sqrt(252). Noisy until there are months of days. */
  annualizedSharpe: number | null;
}

export interface DeploymentStats {
  id: string;
  strategy: { id: string; name: string; description: string | null };
  symbol: string;
  barInterval: string;
  sides: string | null;
  parameters: Record<string, string>;
  liveSince: string;
  lastReport: string;
  hoursSinceLastReport: number;
  startingEquity: number;
  equity: number;
  returnPct: number;
  maxDrawdownPct: number;
  /** How far below its own peak the deployment is now, in percent. */
  currentDrawdownPct: number;
  peakEquity: number;
  position: "Long" | "Short" | "Flat";
  positionShares: number;
  tradesClosed: number;
  winningTrades: number;
  losingTrades: number;
  winRatePct: number | null;
  daily: DailyStats;
  /** [ET date, equity at that day's last report], oldest first; only when asked for. */
  dailyEquity?: [string, number][];
}

export interface TradingStats {
  generatedAt: string;
  notes: string[];
  portfolio: {
    deployments: number;
    totalStartingEquity: number;
    totalEquity: number;
    totalReturnPct: number;
    tradesClosed: number;
    winRatePct: number | null;
    best: { id: string; returnPct: number } | null;
    worst: { id: string; returnPct: number } | null;
  };
  deployments: DeploymentStats[];
}

const etDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places;

/** Each US/Eastern day's last value, oldest first. */
export function dailyCloses(points: EquityPoint[]): [string, number][] {
  const out: [string, number][] = [];
  for (const [t, v] of points) {
    const day = etDay.format(t);
    if (out.length && out[out.length - 1][0] === day) out[out.length - 1][1] = v;
    else out.push([day, v]);
  }
  return out;
}

export function dailyStats(closes: [string, number][]): DailyStats {
  const r: number[] = [];
  for (let i = 1; i < closes.length; i++) r.push((closes[i][1] / closes[i - 1][1] - 1) * 100);
  if (r.length === 0) {
    return { days: closes.length, meanDailyReturnPct: null, stdevDailyReturnPct: null, bestDayPct: null, worstDayPct: null, upDaysPct: null, annualizedSharpe: null };
  }
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  const stdev = r.length > 1 ? Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1)) : null;
  return {
    days: closes.length,
    meanDailyReturnPct: round(mean, 3),
    stdevDailyReturnPct: stdev === null ? null : round(stdev, 3),
    bestDayPct: round(Math.max(...r), 3),
    worstDayPct: round(Math.min(...r), 3),
    upDaysPct: round((r.filter((x) => x > 0).length / r.length) * 100, 1),
    annualizedSharpe: stdev ? round((mean / stdev) * Math.sqrt(252)) : null,
  };
}

export function deploymentStats(row: EquityCurveRow, now: number, includeEquityCurve = false): DeploymentStats {
  const s = summarize(row);
  // summarize scales every curve to a STARTING_CAPITAL base; report real dollars.
  const scale = row.starting_equity / STARTING_CAPITAL;
  const points: EquityPoint[] = s.points.map(([t, v]) => [t, v * scale]);
  const values = points.map(([, v]) => v);
  const peak = Math.max(...values);
  const equity = values[values.length - 1];
  const details = deploymentDetails(s);
  const closes = dailyCloses(points);
  const losses = s.trades - s.wins;
  return {
    id: s.id,
    strategy: { id: s.strategyId, name: s.strategy, description: details.description },
    symbol: s.symbol,
    barInterval: s.interval,
    sides: details.sides,
    parameters: Object.fromEntries(details.params.map((p) => [p.name, p.value])),
    liveSince: new Date(Date.parse(row.starting_at)).toISOString(),
    lastReport: new Date(s.latestAt).toISOString(),
    hoursSinceLastReport: round((now - s.latestAt) / 3_600_000, 1),
    startingEquity: round(row.starting_equity),
    equity: round(equity),
    returnPct: round(s.returnPct),
    maxDrawdownPct: round(s.maxDrawdownPct),
    currentDrawdownPct: round(((peak - equity) / peak) * 100),
    peakEquity: round(peak),
    position: s.position,
    positionShares: row.position_shares,
    tradesClosed: s.trades,
    winningTrades: s.wins,
    losingTrades: losses,
    winRatePct: s.trades > 0 ? round((s.wins / s.trades) * 100, 1) : null,
    daily: dailyStats(closes),
    ...(includeEquityCurve ? { dailyEquity: closes.map(([d, v]) => [d, round(v)] as [string, number]) } : {}),
  };
}

export function tradingStats(rows: EquityCurveRow[], now: number, includeEquityCurve = false): TradingStats {
  const deployments = rows.map((r) => deploymentStats(r, now, includeEquityCurve)).sort((a, b) => b.returnPct - a.returnPct);
  const start = deployments.reduce((a, d) => a + d.startingEquity, 0);
  const total = deployments.reduce((a, d) => a + d.equity, 0);
  const trades = deployments.reduce((a, d) => a + d.tradesClosed, 0);
  const wins = deployments.reduce((a, d) => a + d.winningTrades, 0);
  return {
    generatedAt: new Date(now).toISOString(),
    notes: [
      "Paper trading on Tradier's sandbox: market data runs 15 minutes behind, and fills are simulated.",
      "Each deployment trades its own starting equity (normally $10,000), long only or long and short as listed.",
      "Returns and trades count from each deployment's first report (liveSince), not the backtest it came from.",
      "Deployments that haven't reported in 7 days are left out.",
      "Intraday deployments trade regular-session bars (09:30-16:00 ET); daily ones act after the close.",
    ],
    portfolio: {
      deployments: deployments.length,
      totalStartingEquity: round(start),
      totalEquity: round(total),
      totalReturnPct: start > 0 ? round((total / start - 1) * 100) : 0,
      tradesClosed: trades,
      winRatePct: trades > 0 ? round((wins / trades) * 100, 1) : null,
      best: deployments.length ? { id: deployments[0].id, returnPct: deployments[0].returnPct } : null,
      worst: deployments.length ? { id: deployments[deployments.length - 1].id, returnPct: deployments[deployments.length - 1].returnPct } : null,
    },
    deployments,
  };
}

/** Deployments whose id, symbol or strategy matches `query` (case-insensitive substring). */
export function filterDeployments(rows: EquityCurveRow[], query: string | undefined): EquityCurveRow[] {
  const q = query?.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => [r.deployment_id, r.symbol, r.strategy_id].some((v) => v.toLowerCase().includes(q)));
}
