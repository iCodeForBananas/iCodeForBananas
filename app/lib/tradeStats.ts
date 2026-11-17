// The statistics that decide whether a paper-trading deployment is ready for
// real money, computed the same way for the live record and for its reference
// backtest so the two compare directly. Pure.
//
// Every figure carries enough context to say whether it means anything yet:
// SAMPLE gives the thresholds, and sampleStatus() and compareToBacktest()
// turn them into a verdict rather than leaving a small sample to look
// authoritative.

import { dailyCloses } from "./tradingStats";
import type { EquityPoint } from "./tradingEquity";

/** Below these, a deployment's numbers are shown as not yet meaningful. */
export const SAMPLE = {
  /** Closed trades before trade statistics (profit factor, win rate, expectancy) mean anything. */
  minTrades: 30,
  /** Trading days before daily-return statistics (Sharpe, Sortino) mean anything. */
  minDays: 20,
  /** A mean trade this many standard errors from zero is an edge, not luck. */
  tStat: 2,
  /** Live trades needed before comparing them with the backtest. */
  minCompareTrades: 5,
  /** Live expectancy this many standard errors from the backtest's is divergence. */
  divergenceZ: 2,
} as const;

/** One closed trade (or, rarely, several closed on one bar). */
export interface ClosedTrade {
  time: number;
  /** Realized P&L in dollars. */
  pnl: number;
  /** The equity it was sized from: realized equity before it closed. */
  base: number;
  /** Trades closed on this bar, normally 1. */
  count: number;
  wins: number;
}

/** A trading_trade_ledger() row's trades: [epoch ms, closed, won, pnl, base]. */
export function tradesFromLedger(rows: [number, number, number, number, number][]): ClosedTrade[] {
  return rows.map(([time, count, wins, pnl, base]) => ({ time, count, wins, pnl, base }));
}

export type SampleStatus = "insufficient" | "unproven" | "edge" | "negative";

export interface PerformanceStats {
  trades: number;
  wins: number;
  losses: number;
  winRatePct: number | null;
  grossProfit: number;
  grossLoss: number;
  /** Gross profit over gross loss. Infinity with wins and no losses, null with neither. */
  profitFactor: number | null;
  netPnl: number;
  /** Average P&L per trade, in dollars and as a percent of the equity it was sized from. */
  expectancy: number | null;
  expectancyPct: number | null;
  /** Expectancy in R, where 1R is the average loss: the deployments have no stop to measure risk from. */
  expectancyR: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  avgWinPct: number | null;
  avgLossPct: number | null;
  /** Average win over average loss, both as positive dollars. */
  winLossRatio: number | null;
  /** Mean trade return over its standard error; null under 2 trades. */
  tStat: number | null;
  /** Standard deviation of per-trade returns, percent. */
  tradeStdevPct: number | null;
  longestLosingStreak: number;
  worstTrade: { pnl: number; pct: number } | null;
  bestTrade: { pnl: number; pct: number } | null;
  /** Net P&L without the single best trade: does it depend on one lucky trade? */
  netWithoutBest: number | null;
  /** Share of gross profit from the three biggest wins, percent. */
  topThreeSharePct: number | null;
  /** Share of bars spent holding a position, percent. */
  exposurePct: number | null;
  maxDrawdownPct: number;
  maxDrawdownDollars: number;
  currentDrawdownPct: number;
  /** Share of the time spent below a previous peak, percent. */
  timeInDrawdownPct: number;
  /** Days since the last peak, when below it now. */
  drawdownDays: number;
  tradingDays: number;
  /** Annualized from daily returns. */
  sharpe: number | null;
  sortino: number | null;
  /** Closed trades per 21 trading days. */
  tradesPerMonth: number | null;
}

const DAY = 86_400_000;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
function stdev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

/** Per-trade returns in percent of the equity each was sized from. */
export function tradeReturns(trades: ClosedTrade[]): number[] {
  return trades.filter((t) => t.base > 0).map((t) => (t.pnl / t.base) * 100);
}

export function performanceStats(input: { trades: ClosedTrade[]; points: EquityPoint[]; bars?: number; barsInPosition?: number }): PerformanceStats {
  const { trades, points } = input;
  const n = trades.reduce((a, t) => a + t.count, 0);
  const wins = trades.reduce((a, t) => a + t.wins, 0);
  const winners = trades.filter((t) => t.pnl > 0);
  const losers = trades.filter((t) => t.pnl < 0);
  const grossProfit = winners.reduce((a, t) => a + t.pnl, 0);
  const grossLoss = -losers.reduce((a, t) => a + t.pnl, 0);
  const netPnl = grossProfit - grossLoss;
  const returns = tradeReturns(trades);
  const pct = (t: ClosedTrade) => (t.base > 0 ? (t.pnl / t.base) * 100 : 0);
  const sd = stdev(returns);
  const avgLoss = losers.length ? grossLoss / losers.length : null;
  const expectancy = n ? netPnl / n : null;

  let streak = 0;
  let longest = 0;
  for (const t of trades) {
    streak = t.pnl < 0 ? streak + t.count : 0;
    longest = Math.max(longest, streak);
  }
  const byPnl = [...trades].sort((a, b) => a.pnl - b.pnl);
  const worst = byPnl[0];
  const best = byPnl[byPnl.length - 1];
  const topThree = [...winners].sort((a, b) => b.pnl - a.pnl).slice(0, 3).reduce((a, t) => a + t.pnl, 0);

  // Drawdown and time under water, from the equity curve.
  let peak = -Infinity;
  let peakAt = 0;
  let maxPct = 0;
  let maxDollars = 0;
  let under = 0;
  for (const [t, v] of points) {
    if (v >= peak) {
      peak = v;
      peakAt = t;
    } else {
      under++;
      maxPct = Math.max(maxPct, ((peak - v) / peak) * 100);
      maxDollars = Math.max(maxDollars, peak - v);
    }
  }
  const last = points.length ? points[points.length - 1] : null;
  const currentDrawdownPct = last && peak > 0 ? ((peak - last[1]) / peak) * 100 : 0;

  // Daily returns: Sharpe on all of them, Sortino on the downside only.
  const closes = dailyCloses(points);
  const daily: number[] = [];
  for (let i = 1; i < closes.length; i++) daily.push(closes[i][1] / closes[i - 1][1] - 1);
  const dailySd = stdev(daily);
  const downside = daily.length ? Math.sqrt(daily.reduce((a, r) => a + Math.min(r, 0) ** 2, 0) / daily.length) : 0;
  const tradingDays = closes.length;

  return {
    trades: n,
    wins,
    losses: n - wins,
    winRatePct: n ? (wins / n) * 100 : null,
    grossProfit,
    grossLoss,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : null,
    netPnl,
    expectancy,
    expectancyPct: returns.length ? mean(returns) : null,
    expectancyR: expectancy !== null && avgLoss ? expectancy / avgLoss : null,
    avgWin: winners.length ? grossProfit / winners.length : null,
    avgLoss,
    avgWinPct: winners.length ? mean(winners.map(pct)) : null,
    avgLossPct: losers.length ? mean(losers.map(pct)) : null,
    winLossRatio: winners.length && avgLoss ? grossProfit / winners.length / avgLoss : null,
    tStat: sd ? mean(returns) / (sd / Math.sqrt(returns.length)) : null,
    tradeStdevPct: sd,
    longestLosingStreak: longest,
    worstTrade: worst ? { pnl: worst.pnl, pct: pct(worst) } : null,
    bestTrade: best ? { pnl: best.pnl, pct: pct(best) } : null,
    netWithoutBest: best && best.pnl > 0 ? netPnl - best.pnl : trades.length ? netPnl : null,
    topThreeSharePct: grossProfit > 0 ? (topThree / grossProfit) * 100 : null,
    exposurePct: input.bars ? ((input.barsInPosition ?? 0) / input.bars) * 100 : null,
    maxDrawdownPct: maxPct,
    maxDrawdownDollars: maxDollars,
    currentDrawdownPct,
    timeInDrawdownPct: points.length ? (under / points.length) * 100 : 0,
    drawdownDays: last && currentDrawdownPct > 0 ? (last[0] - peakAt) / DAY : 0,
    tradingDays,
    sharpe: dailySd ? (mean(daily) / dailySd) * Math.sqrt(252) : null,
    sortino: downside > 0 ? (mean(daily) / downside) * Math.sqrt(252) : null,
    tradesPerMonth: tradingDays > 1 ? (n / tradingDays) * 21 : null,
  };
}

export interface Sample {
  status: SampleStatus;
  /** Short, for a table cell. */
  label: string;
  /** What the verdict rests on, with the thresholds. */
  detail: string;
  /** Whether trade statistics (profit factor, win rate, expectancy) mean anything yet. */
  tradeStatsMeaningful: boolean;
  /** Whether Sharpe and Sortino mean anything yet. */
  dailyStatsMeaningful: boolean;
}

export function sampleStatus(s: Pick<PerformanceStats, "trades" | "tradingDays" | "tStat">): Sample {
  const tradeStatsMeaningful = s.trades >= SAMPLE.minTrades;
  const dailyStatsMeaningful = s.tradingDays >= SAMPLE.minDays;
  const counts = `${s.trades}/${SAMPLE.minTrades} trades, ${s.tradingDays}/${SAMPLE.minDays} trading days`;
  if (!tradeStatsMeaningful || !dailyStatsMeaningful) {
    return { status: "insufficient", label: "Not enough data", detail: `Needs ${SAMPLE.minTrades} closed trades and ${SAMPLE.minDays} trading days before its numbers mean anything: has ${counts}.`, tradeStatsMeaningful, dailyStatsMeaningful };
  }
  const t = s.tStat ?? 0;
  const tText = `t = ${t.toFixed(1)}`;
  if (t >= SAMPLE.tStat) return { status: "edge", label: "Edge holding", detail: `The average trade is ${tText} standard errors above zero (${SAMPLE.tStat} or more is unlikely to be luck), over ${counts}.`, tradeStatsMeaningful, dailyStatsMeaningful };
  if (t <= -SAMPLE.tStat) return { status: "negative", label: "Losing", detail: `The average trade is ${Math.abs(t).toFixed(1)} standard errors below zero: losing beyond what chance explains, over ${counts}.`, tradeStatsMeaningful, dailyStatsMeaningful };
  return { status: "unproven", label: "Edge not proven", detail: `Enough data, but the average trade is only ${tText} standard errors from zero (needs ${SAMPLE.tStat}): can't yet tell it from luck.`, tradeStatsMeaningful, dailyStatsMeaningful };
}

export type DivergenceStatus = "too-early" | "in-line" | "worse" | "better" | "no-backtest" | "unavailable";

export interface Divergence {
  status: DivergenceStatus;
  label: string;
  detail: string;
  /** Live mean trade minus the backtest's, in the backtest's standard errors for this many trades. */
  z: number | null;
  liveExpectancyPct: number | null;
  backtestExpectancyPct: number | null;
}

/**
 * Whether the live trades are what the backtest would produce. The live mean
 * trade return is tested against the backtest's mean and spread: with n live
 * trades, the backtest's mean should land within about two of its own
 * standard errors (sd / sqrt(n)) of the live one. Further than that, live
 * trading isn't doing what was tested.
 */
/** When the live trades themselves couldn't be read. */
export const UNAVAILABLE_DIVERGENCE: Divergence = {
  status: "unavailable",
  label: "No trade data",
  detail: "The live trades couldn't be read, so they can't be compared with the backtest yet.",
  z: null,
  liveExpectancyPct: null,
  backtestExpectancyPct: null,
};

export function compareToBacktest(live: ClosedTrade[], backtest: ClosedTrade[] | null): Divergence {
  const liveR = tradeReturns(live);
  const btR = backtest ? tradeReturns(backtest) : [];
  const liveMean = liveR.length ? mean(liveR) : null;
  const btMean = btR.length ? mean(btR) : null;
  const base = { liveExpectancyPct: liveMean, backtestExpectancyPct: btMean };
  if (!backtest || btR.length < 2) return { ...base, status: "no-backtest", label: "No backtest", detail: "No reference backtest to compare with.", z: null };
  if (liveR.length < SAMPLE.minCompareTrades) {
    return { ...base, status: "too-early", label: "Too early", detail: `Needs ${SAMPLE.minCompareTrades} live trades to compare with the backtest; has ${liveR.length}.`, z: null };
  }
  const sd = stdev(btR)!;
  const z = sd > 0 ? (liveMean! - btMean!) / (sd / Math.sqrt(liveR.length)) : 0;
  const per = `${liveMean!.toFixed(2)}% per trade live vs ${btMean!.toFixed(2)}% in the backtest over ${liveR.length} trades (z = ${z.toFixed(1)})`;
  if (z <= -SAMPLE.divergenceZ) return { ...base, status: "worse", label: "Worse than backtest", detail: `${per}: further below than chance explains. Live trading isn't doing what was tested.`, z };
  if (z >= SAMPLE.divergenceZ) return { ...base, status: "better", label: "Better than backtest", detail: `${per}: further above than chance explains. Check it isn't a fluke or a fill problem.`, z };
  return { ...base, status: "in-line", label: "In line", detail: `${per}: within what the backtest's spread explains.`, z };
}
