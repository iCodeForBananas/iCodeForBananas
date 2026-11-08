// Turns what the trading Lambdas report (supabase/migrations/20261108_trading_equity.sql)
// into what /trading-equity shows. Pure.

/** Every deployment is shown as if it had started with this much. */
export const STARTING_CAPITAL = 10_000;

/** One row of the trading_equity_curves() RPC. */
export interface EquityCurveRow {
  deployment_id: string;
  strategy_id: string;
  symbol: string;
  bar_interval: string;
  starting_at: string;
  starting_equity: number;
  starting_trades_closed: number;
  starting_winning_trades: number;
  latest_at: string;
  position_shares: number;
  trades_closed: number;
  winning_trades: number;
  /** [epoch ms, equity], oldest first. */
  points: [number, number][];
}

export type EquityPoint = [time: number, value: number];

export interface EquitySummary {
  id: string;
  /** Short and unique among live deployments, e.g. "QQQ 15m". */
  label: string;
  strategy: string;
  /** The curve on a STARTING_CAPITAL base, beginning at exactly that value. */
  points: EquityPoint[];
  value: number;
  returnPct: number;
  /** Largest peak-to-trough fall, as a positive percent. */
  maxDrawdownPct: number;
  position: "Long" | "Short" | "Flat";
  /** Closed since the first report. */
  trades: number;
  wins: number;
  latestAt: number;
}

const ACRONYMS = /\b(ibs|ema|sma|rsi|macd|vwap)\b/g;

export function strategyName(id: string): string {
  const words = id.replace(/-/g, " ").replace(ACRONYMS, (m) => m.toUpperCase());
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function maxDrawdownPct(points: EquityPoint[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const [, value] of points) {
    if (value > peak) peak = value;
    else worst = Math.max(worst, ((peak - value) / peak) * 100);
  }
  return worst;
}

/**
 * Scales a deployment's real equity so its first report is STARTING_CAPITAL.
 * Scaling, rather than adding dollar P&L to it, keeps percent returns true to
 * what the deployment did on whatever allocation it really has.
 */
export function summarize(row: EquityCurveRow): EquitySummary {
  const scale = STARTING_CAPITAL / row.starting_equity;
  const startedAt = Date.parse(row.starting_at);
  const points: EquityPoint[] = [[startedAt, STARTING_CAPITAL]];
  for (const [t, equity] of row.points) {
    if (t > startedAt) points.push([t, equity * scale]);
  }
  const value = points[points.length - 1][1];
  return {
    id: row.deployment_id,
    label: `${row.symbol} ${row.bar_interval.replace("min", "m")}`,
    strategy: strategyName(row.strategy_id),
    points,
    value,
    returnPct: (value / STARTING_CAPITAL - 1) * 100,
    maxDrawdownPct: maxDrawdownPct(points),
    position: row.position_shares > 0 ? "Long" : row.position_shares < 0 ? "Short" : "Flat",
    trades: row.trades_closed - row.starting_trades_closed,
    wins: row.winning_trades - row.starting_winning_trades,
    latestAt: Date.parse(row.latest_at),
  };
}

export type MergedRow = { t: number } & Record<string, number>;

/**
 * One row per moment any deployment reported, each deployment holding its last
 * value between its own reports so every row can be read across. A deployment
 * has no key before its first report.
 */
export function mergeCurves(curves: Pick<EquitySummary, "id" | "points">[]): MergedRow[] {
  const times = [...new Set(curves.flatMap((c) => c.points.map(([t]) => t)))].sort((a, b) => a - b);
  const cursors = curves.map(() => 0);
  return times.map((t) => {
    const row = { t } as MergedRow;
    curves.forEach((curve, i) => {
      while (cursors[i] < curve.points.length && curve.points[cursors[i]][0] <= t) cursors[i]++;
      if (cursors[i] > 0) row[curve.id] = curve.points[cursors[i] - 1][1];
    });
    return row;
  });
}

/** A y-axis that contains `values` and has round ticks, about `count` of them. */
export function niceScale(values: number[], count = 5): { domain: [number, number]; ticks: number[] } {
  const low = Math.min(...values);
  const high = Math.max(...values);
  const rough = Math.max(high - low, 1) / (count - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough)!;
  const start = Math.floor(low / step) * step;
  const end = Math.ceil(high / step) * step;
  const ticks: number[] = [];
  for (let k = 0; start + k * step <= end + step / 2; k++) ticks.push(start + k * step);
  return { domain: [start, ticks[ticks.length - 1]], ticks };
}

export function formatAge(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
