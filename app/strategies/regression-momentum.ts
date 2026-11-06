// Regression Momentum (Andreas Clenow, "Stocks on the Move", 2015)
// Fit a straight line to the log of the close over the last 90 bars. Its
// slope, annualized, is the trend's growth rate; multiplying by R² discounts
// a trend that got there in a few jumps rather than steadily. Clenow ranks
// stocks by this score and holds the strongest ones that are above their
// 100-day moving average and haven't gapped more than 15% inside the window.
// It builds on the momentum literature (Jegadeesh & Titman, 1993) that quant
// equity funds have traded for decades.
// One instrument has no ranking, so this trades the score against a fixed
// bar: buy when it's above minScore with price over the moving average and no
// big gap, exit when price falls under the average or the score drops to
// exitScore. Shorts mirror it.

import { StrategyDefinition, StrategyHandler, StrategyParameter, OHLCBar } from './types';

export interface RegressionArrays {
  /** Annualized log-regression slope times R², in percent. */
  score: number[];
  /** Biggest single-bar move inside the window, in percent. */
  maxGap: number[];
}

const regCache = new WeakMap<object, Map<string, RegressionArrays>>();

export function getRegressionMomentum(series: OHLCBar[], lookback: number, barsPerYear: number): RegressionArrays {
  let byKey = regCache.get(series);
  if (!byKey) {
    byKey = new Map();
    regCache.set(series, byKey);
  }
  const key = `${lookback}_${barsPerYear}`;
  const cached = byKey.get(key);
  if (cached) return cached;

  const n = series.length;
  const L = lookback;
  const score = new Array<number>(n).fill(NaN);
  const maxGap = new Array<number>(n).fill(NaN);
  // x runs 0..L-1 across the window, so its sums are fixed.
  const sx = (L * (L - 1)) / 2;
  const sxx = ((L - 1) * L * (2 * L - 1)) / 6;
  const varX = L * sxx - sx * sx;
  const y = series.map((b) => Math.log(b.close));
  const gaps = series.map((b, i) => (i === 0 ? 0 : Math.abs(b.close / series[i - 1].close - 1) * 100));
  // Running sums of y, y² and j·y (j = absolute bar index) over the window,
  // and a monotonic deque of the window's largest move.
  let sy = 0, syy = 0, sjy = 0;
  const deque: number[] = [];
  let head = 0;
  for (let i = 0; i < n; i++) {
    sy += y[i];
    syy += y[i] * y[i];
    sjy += i * y[i];
    if (i >= L) {
      const o = i - L;
      sy -= y[o];
      syy -= y[o] * y[o];
      sjy -= o * y[o];
    }
    while (deque.length > head && gaps[deque[deque.length - 1]] <= gaps[i]) deque.pop();
    deque.push(i);
    // The window's own moves are bars i-L+2..i; the first bar's move came
    // from a bar outside it.
    while (deque[head] < i - L + 2) head++;
    if (i < L - 1) continue;
    const start = i - L + 1;
    const sxy = sjy - start * sy;
    const cov = L * sxy - sx * sy;
    const varY = L * syy - sy * sy;
    const slope = cov / varX;
    const r2 = varY > 0 ? Math.min(1, (cov * cov) / (varX * varY)) : 0;
    score[i] = (Math.exp(slope * barsPerYear) - 1) * 100 * r2;
    maxGap[i] = gaps[deque[head]];
  }

  const result = { score, maxGap };
  byKey.set(key, result);
  return result;
}

const smaCache = new WeakMap<object, Map<number, number[]>>();

/** Simple moving average of the close, NaN until the window fills. */
export function getSmaArray(series: OHLCBar[], period: number): number[] {
  let byPeriod = smaCache.get(series);
  if (!byPeriod) {
    byPeriod = new Map();
    smaCache.set(series, byPeriod);
  }
  const cached = byPeriod.get(period);
  if (cached) return cached;
  const out = new Array<number>(series.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < series.length; i++) {
    sum += series[i].close;
    if (i >= period) sum -= series[i - period].close;
    if (i >= period - 1) out[i] = sum / period;
  }
  byPeriod.set(period, out);
  return out;
}

const parameters: StrategyParameter[] = [
  {
    key: 'lookback',
    name: 'Regression Lookback',
    description: 'Bars in the log-price regression (Clenow: 90 days)',
    type: 'number',
    default: 90,
    min: 20,
    max: 250,
    step: 10,
  },
  {
    key: 'maPeriod',
    name: 'Trend MA Period',
    description: 'Only hold while the close is above this SMA (Clenow: 100)',
    type: 'number',
    default: 100,
    min: 20,
    max: 250,
    step: 10,
  },
  {
    key: 'minScore',
    name: 'Entry Score (%)',
    description: 'Enter when the annualized slope x R² is above this percent',
    type: 'number',
    default: 30,
    min: 0,
    max: 150,
    step: 10,
  },
  {
    key: 'exitScore',
    name: 'Exit Score (%)',
    description: 'Exit when the score falls to this percent, or price drops under the SMA',
    type: 'number',
    default: 0,
    min: -50,
    max: 100,
    step: 10,
  },
  {
    key: 'maxGapPct',
    name: 'Max Gap (%)',
    description: 'Skip entries when any single bar in the window moved more than this (Clenow: 15)',
    type: 'number',
    default: 15,
    min: 5,
    max: 50,
    step: 5,
  },
  {
    key: 'barsPerYear',
    name: 'Bars Per Year',
    description: 'Annualizes the slope: 252 for daily bars, 52 weekly, about 1,764 hourly (7 a session)',
    type: 'number',
    default: 252,
    min: 52,
    max: 100000,
    step: 1,
  },
];

const handler: StrategyHandler = ({ current, series, index, params, position }) => {
  const lookback = (params.lookback as number) || 90;
  const maPeriod = (params.maPeriod as number) || 100;
  const minScore = (params.minScore as number) ?? 30;
  const exitScore = (params.exitScore as number) ?? 0;
  const maxGapPct = (params.maxGapPct as number) || 15;
  const barsPerYear = (params.barsPerYear as number) || 252;

  const { score, maxGap } = getRegressionMomentum(series, lookback, barsPerYear);
  const sma = getSmaArray(series, maPeriod)[index];
  const s = score[index];
  if (Number.isNaN(s) || Number.isNaN(sma)) return { action: 'hold', reason: 'Warming up' };
  const close = current.close;

  if (position === 'long') {
    if (close < sma) return { action: 'sell', reason: `Close under SMA ${maPeriod}` };
    if (s <= exitScore) return { action: 'sell', reason: `Score ${s.toFixed(0)}% at or under ${exitScore}%` };
    return { action: 'hold', reason: '' };
  }
  if (position === 'short') {
    if (close > sma) return { action: 'buy', reason: `Close over SMA ${maPeriod}` };
    if (s >= -exitScore) return { action: 'buy', reason: `Score ${s.toFixed(0)}% at or over ${-exitScore}%` };
    return { action: 'hold', reason: '' };
  }
  if (maxGap[index] > maxGapPct) return { action: 'hold', reason: '' };
  if (s > minScore && close > sma) return { action: 'buy', reason: `Regression score ${s.toFixed(0)}%` };
  if (s < -minScore && close < sma) return { action: 'sell', reason: `Regression score ${s.toFixed(0)}%` };
  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'regression-momentum',
  name: 'Regression Momentum (Clenow)',
  description: "Clenow's annualized log-regression slope x R²: buy a strong, steady trend above its 100 SMA with no big gaps; exit under the SMA or when the trend fades.",
  handler,
  parameters,
};

export default strategy;
