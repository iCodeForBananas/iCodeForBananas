// One deployment's equity history, from its full-resolution snapshots, for
// the Trading Leaderboard's deployment panel: the curve, its drawdown
// periods, the peak and the current drawdown, and what it holds now. Pure.
//
// A snapshot is written after every bar the deployment's Lambda processes,
// with equity marked to that bar's close (open P&L included), so this is the
// true mark-to-market curve, not one rebuilt from fills.

import type { EquityPoint } from "./tradingEquity";
import type { SnapshotRow } from "./tradingHistorySource";

export type { SnapshotRow };

export interface DrawdownPeriod {
  /** The peak it fell from. */
  start: number;
  /** Back at or above that peak; null while still under it. */
  end: number | null;
  troughTime: number;
  depthPct: number;
  depthDollars: number;
}

export interface EquityHistory {
  points: EquityPoint[];
  first: { time: number; value: number };
  last: { time: number; value: number };
  peak: { time: number; value: number };
  /** The deepest drawdown and where it bottomed. */
  maxDrawdown: { pct: number; dollars: number; peakTime: number; troughTime: number; troughValue: number; recoveredAt: number | null } | null;
  /** How far under its peak it is now. */
  current: { pct: number; dollars: number; since: number | null };
  /** Every period under a previous peak at least `minDepthPct` deep, oldest first. */
  drawdowns: DrawdownPeriod[];
  position: {
    shares: number;
    side: "Long" | "Short" | "Flat";
    /** First bar of the current holding, if it started inside the record. */
    since: number | null;
    openPnl: number;
  };
  /** Realized P&L over the record, and in total since the deployment's state began. */
  realizedSinceStart: number;
  realizedTotal: number;
}

export function equityHistory(rows: SnapshotRow[], minDepthPct = 0.25): EquityHistory | null {
  if (rows.length === 0) return null;
  const points: EquityPoint[] = rows.map((r) => [Date.parse(r.bar_time), r.equity]);

  let peakValue = -Infinity;
  let peakTime = points[0][0];
  let open: DrawdownPeriod | null = null;
  const drawdowns: DrawdownPeriod[] = [];
  let worst: EquityHistory["maxDrawdown"] = null;
  for (const [t, v] of points) {
    if (v >= peakValue) {
      if (open) {
        open.end = t;
        if (open.depthPct >= minDepthPct) drawdowns.push(open);
        if (worst && worst.peakTime === open.start && worst.recoveredAt === null) worst.recoveredAt = t;
        open = null;
      }
      peakValue = v;
      peakTime = t;
      continue;
    }
    const pct = ((peakValue - v) / peakValue) * 100;
    open ??= { start: peakTime, end: null, troughTime: t, depthPct: 0, depthDollars: 0 };
    if (pct > open.depthPct) {
      open.depthPct = pct;
      open.depthDollars = peakValue - v;
      open.troughTime = t;
    }
    if (!worst || pct > worst.pct) worst = { pct, dollars: peakValue - v, peakTime, troughTime: t, troughValue: v, recoveredAt: null };
  }
  if (open && open.depthPct >= minDepthPct) drawdowns.push(open);

  const [lastTime, lastValue] = points[points.length - 1];
  const lastRow = rows[rows.length - 1];
  const shares = lastRow.position_shares;
  // Walk back over the bars holding this same position to find when it began.
  let since: number | null = null;
  if (shares !== 0) {
    let i = rows.length - 1;
    while (i > 0 && rows[i - 1].position_shares === shares) i--;
    since = i > 0 ? Date.parse(rows[i].bar_time) : null;
  }

  return {
    points,
    first: { time: points[0][0], value: points[0][1] },
    last: { time: lastTime, value: lastValue },
    peak: { time: peakTime, value: peakValue },
    maxDrawdown: worst,
    current: {
      pct: lastValue < peakValue ? ((peakValue - lastValue) / peakValue) * 100 : 0,
      dollars: Math.max(0, peakValue - lastValue),
      since: lastValue < peakValue ? peakTime : null,
    },
    drawdowns,
    position: {
      shares,
      side: shares > 0 ? "Long" : shares < 0 ? "Short" : "Flat",
      since,
      openPnl: lastRow.unrealized_pnl,
    },
    realizedSinceStart: lastRow.realized_pnl - rows[0].realized_pnl,
    realizedTotal: lastRow.realized_pnl,
  };
}

/**
 * The backtest's curve over the live record's span, scaled so it starts
 * where the live curve does: the same strategy on the same bars, so the gap
 * between the two lines is the live-versus-backtest divergence. Null when the
 * backtest's data doesn't reach far enough to overlap.
 */
export function backtestOverlay(backtest: EquityPoint[], liveStart: { time: number; value: number }): EquityPoint[] | null {
  let i = backtest.findIndex(([t]) => t >= liveStart.time);
  if (i === -1) return null;
  // Start from the backtest's value at the live start: the last point at or before it.
  if (i > 0 && backtest[i][0] > liveStart.time) i--;
  const base = backtest[i][1];
  if (!(base > 0)) return null;
  const out: EquityPoint[] = backtest.slice(i).map(([t, v]) => [Math.max(t, liveStart.time), (v / base) * liveStart.value]);
  return out.length >= 2 ? out : null;
}
