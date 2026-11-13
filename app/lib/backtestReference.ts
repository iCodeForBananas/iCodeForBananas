// A reference backtest for each live paper-trading deployment, so the
// leaderboard's "Analyze in Claude" prompt can compare what a deployment is
// doing live with what the same strategy did historically. Runs the app's own
// engine on the app's own datasets (public/data) with the live runtime's
// settings (trading/runtime/config.ts DEFAULTS and run.ts): 100% of its own
// $10,000, whole shares, no stop or target, exits only on the strategy's
// signal, no stop-and-reverse, the 25% drawdown limit with a 20-bar pause.
// The live 2% daily loss cap has no engine equivalent and is left out. Pure.

import {
  calculateIndicatorsWithParams,
  deriveRequiredIndicators,
  runBacktestWithParams,
  INITIAL_CAPITAL,
  LEGACY_SIZING,
  type RiskSettings,
} from "./backtest-engine";
import { AVAILABLE_STRATEGIES } from "@/app/strategies";
import type { PricePoint } from "@/app/types";
import type { ParamValue } from "./deploymentDetails";
import type { EquityPoint } from "./tradingEquity";
import { dailyCloses } from "./tradingStats";

/** What the live runtime does with every deployment, in the engine's terms. */
export function liveRiskSettings(): RiskSettings {
  return {
    stopLossPercent: 0,
    takeProfitPercent: 0,
    positionSizePercent: 100,
    commissionBps: 0,
    slippageBps: 0,
    sizing: {
      ...LEGACY_SIZING,
      mode: "fixed",
      useStopLoss: false,
      useTakeProfit: false,
      maxDrawdownPercent: 25,
      drawdownPauseBars: 20,
      wholeShares: true,
      allowReversal: false,
    },
  };
}

export interface BacktestReference {
  dataset: string;
  /** ET dates of the first and last bar. */
  from: string;
  to: string;
  years: number;
  returnPct: number;
  /** Compound annual growth, from the return over the span. */
  cagrPct: number;
  maxDrawdownPct: number;
  sharpe: number;
  trades: number;
  winRatePct: number | null;
  tradesPerMonth: number;
  /**
   * The backtest and the live record over the stretch both cover, if they
   * overlap by more than a bar: the same strategy on the same bars. A gap is
   * execution (delayed data, simulated fills, timing) unless the backtest was
   * already in a trade when the live record began from wherever it stood.
   */
  sameWindow: { from: string; to: string; backtestPct: number; livePct: number; backtestInTradeAtStart: boolean } | null;
  /** [ET date, daily return %], for correlating deployments. Not printed. */
  dailyReturns: [string, number][];
}

const etDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places;
const YEAR_MS = 365.25 * 86_400_000;

/** Date,Open,High,Low,Close[,Volume] rows, oldest first; unusable rows dropped. */
export function parsePriceCsv(text: string): PricePoint[] {
  const out: PricePoint[] = [];
  for (const line of text.split(/\r?\n/).slice(1)) {
    const v = line.split(",");
    if (v.length < 5) continue;
    const time = Date.parse(v[0]);
    const [open, high, low, close] = [v[1], v[2], v[3], v[4]].map(Number);
    if (Number.isNaN(time) || !(open > 0 && high > 0 && low > 0 && close > 0)) continue;
    out.push({ time, open, high, low, close });
  }
  return out.sort((a, b) => a.time - b.time);
}

/** The equity at the last point at or before `t`, or null if there is none. */
function valueAt(points: EquityPoint[], t: number): number | null {
  let v: number | null = null;
  for (const [time, value] of points) {
    if (time > t) break;
    v = value;
  }
  return v;
}

export interface ReferenceInput {
  strategyId: string;
  values: Record<string, ParamValue>;
  shorts: boolean;
  dataset: string;
  /** The live record, in any consistent unit: [epoch ms, equity], oldest first. */
  live: EquityPoint[];
}

export function backtestReference(bars: PricePoint[], d: ReferenceInput): BacktestReference | null {
  const strategy = AVAILABLE_STRATEGIES[d.strategyId];
  if (!strategy || bars.length < 2) return null;
  const params = { ...Object.fromEntries((strategy.parameters ?? []).map((p) => [p.key, p.default])), ...d.values };
  const req = deriveRequiredIndicators(d.strategyId, [params]);
  const data = calculateIndicatorsWithParams(bars, req.requiredEMAs, req.requiredSMAs, req.requiredMACDs, req.requiredDonchianPeriods);
  const r = runBacktestWithParams(data, strategy, params, INITIAL_CAPITAL, liveRiskSettings(), d.shorts);

  const first = bars[0].time;
  const last = bars[bars.length - 1].time;
  const years = (last - first) / YEAR_MS;
  const growth = 1 + r.totalPnlPercent / 100;
  const curve: EquityPoint[] = r.equityCurve.map((p) => [p.time, p.equity]);

  let sameWindow: BacktestReference["sameWindow"] = null;
  if (d.live.length > 0) {
    const start = d.live[0][0];
    const end = Math.min(last, d.live[d.live.length - 1][0]);
    const btStart = valueAt(curve, start);
    const btEnd = valueAt(curve, end);
    const liveStart = d.live[0][1];
    const liveEnd = valueAt(d.live, end);
    const barsInWindow = bars.filter((b) => b.time > start && b.time <= end).length;
    if (barsInWindow >= 2 && btStart && btEnd && liveEnd) {
      sameWindow = {
        from: etDate.format(start),
        to: etDate.format(end),
        backtestPct: round((btEnd / btStart - 1) * 100),
        livePct: round((liveEnd / liveStart - 1) * 100),
        backtestInTradeAtStart: r.trades.some((t) => t.entryTime <= start && t.exitTime > start),
      };
    }
  }

  const closes = dailyCloses(curve);
  const dailyReturns: [string, number][] = [];
  for (let i = 1; i < closes.length; i++) dailyReturns.push([closes[i][0], (closes[i][1] / closes[i - 1][1] - 1) * 100]);

  return {
    dataset: d.dataset,
    from: etDate.format(first),
    to: etDate.format(last),
    years: round(years, 1),
    returnPct: round(r.totalPnlPercent),
    cagrPct: years > 0 && growth > 0 ? round((growth ** (1 / years) - 1) * 100) : round(r.totalPnlPercent),
    maxDrawdownPct: round(r.maxDrawdownPercent),
    sharpe: round(r.sharpeRatio),
    trades: r.totalTrades,
    winRatePct: r.totalTrades > 0 ? round(r.winRate, 1) : null,
    tradesPerMonth: years > 0 ? round(r.totalTrades / (years * 12), 1) : r.totalTrades,
    sameWindow,
    dailyReturns,
  };
}

export interface Correlation {
  a: string;
  b: string;
  r: number;
  days: number;
}

/**
 * Pearson correlation of each pair's daily returns over the days both have,
 * strongest first. Pairs sharing fewer than `minDays` days are left out:
 * fewer than that says nothing.
 */
export function correlations(series: Map<string, [string, number][]>, minDays = 60): Correlation[] {
  const ids = [...series.keys()];
  const maps = new Map(ids.map((id) => [id, new Map(series.get(id))]));
  const out: Correlation[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = maps.get(ids[i])!;
      const b = maps.get(ids[j])!;
      const xs: number[] = [];
      const ys: number[] = [];
      for (const [day, x] of a) {
        const y = b.get(day);
        if (y !== undefined) {
          xs.push(x);
          ys.push(y);
        }
      }
      if (xs.length < minDays) continue;
      const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
      const my = ys.reduce((s, v) => s + v, 0) / ys.length;
      let sxy = 0, sxx = 0, syy = 0;
      for (let k = 0; k < xs.length; k++) {
        sxy += (xs[k] - mx) * (ys[k] - my);
        sxx += (xs[k] - mx) ** 2;
        syy += (ys[k] - my) ** 2;
      }
      if (sxx === 0 || syy === 0) continue;
      out.push({ a: ids[i], b: ids[j], r: round(sxy / Math.sqrt(sxx * syy)), days: xs.length });
    }
  }
  return out.sort((p, q) => Math.abs(q.r) - Math.abs(p.r));
}
