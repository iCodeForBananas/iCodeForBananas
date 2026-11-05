// ConnorsRSI Pullback (Larry Connors & Cesar Alvarez, "An Introduction to
// ConnorsRSI", 2012)
// ConnorsRSI averages three 0-100 readings of how stretched a bar is:
//   - a 3-period Wilder RSI of the close,
//   - a 2-period RSI of the up/down streak (how many closes in a row rose or fell),
//   - the percent rank of today's 1-bar change among the last 100.
// Buy when it drops below 10 while price is above the 200 SMA, sell when it
// climbs back above 70. Long only, like the other Connors pullback systems.

import { StrategyDefinition, StrategyHandler, StrategyParameter, OHLCBar, IndicatorValues } from './types';

type Series = (OHLCBar & IndicatorValues)[];

/** Wilder RSI of any value series; NaN until the first full period. */
export function wilderRsi(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  let ag = 0, al = 0;
  for (let i = 1; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    const g = delta > 0 ? delta : 0;
    const l = delta < 0 ? -delta : 0;
    if (i < period) { ag += g; al += l; }
    else if (i === period) { ag = (ag + g) / period; al = (al + l) / period; }
    else { ag = (ag * (period - 1) + g) / period; al = (al * (period - 1) + l) / period; }
    if (i >= period) result[i] = al === 0 ? (ag === 0 ? 50 : 100) : 100 - 100 / (1 + ag / al);
  }
  return result;
}

/** Consecutive up closes as a positive count, down closes as negative, 0 on an unchanged close. */
export function streaks(series: OHLCBar[]): number[] {
  const result: number[] = new Array(series.length).fill(0);
  for (let i = 1; i < series.length; i++) {
    const prev = result[i - 1];
    if (series[i].close > series[i - 1].close) result[i] = prev > 0 ? prev + 1 : 1;
    else if (series[i].close < series[i - 1].close) result[i] = prev < 0 ? prev - 1 : -1;
  }
  return result;
}

// Whole-series ConnorsRSI, computed once per (series, periods) the way
// cumulative-rsi caches its RSI. NaN until all three parts have history.
const crsiCache = new WeakMap<Series, Map<string, number[]>>();

export function getConnorsRsiArray(series: Series, rsiPeriod: number, streakPeriod: number, rankPeriod: number): number[] {
  let byKey = crsiCache.get(series);
  if (!byKey) {
    byKey = new Map();
    crsiCache.set(series, byKey);
  }
  const key = `${rsiPeriod}_${streakPeriod}_${rankPeriod}`;
  const cached = byKey.get(key);
  if (cached) return cached;

  const priceRsi = wilderRsi(series.map((b) => b.close), rsiPeriod);
  const streakRsi = wilderRsi(streaks(series), streakPeriod);
  const change = series.map((b, i) => (i === 0 ? NaN : (b.close - series[i - 1].close) / series[i - 1].close));

  const result: number[] = new Array(series.length).fill(NaN);
  for (let i = rankPeriod + 1; i < series.length; i++) {
    // Share of the previous `rankPeriod` changes that were smaller than today's.
    let below = 0;
    for (let j = i - rankPeriod; j < i; j++) if (change[j] < change[i]) below++;
    const rank = (below / rankPeriod) * 100;
    if (!Number.isNaN(priceRsi[i]) && !Number.isNaN(streakRsi[i])) {
      result[i] = (priceRsi[i] + streakRsi[i] + rank) / 3;
    }
  }

  byKey.set(key, result);
  return result;
}

const parameters: StrategyParameter[] = [
  {
    key: 'entryLevel',
    name: 'Entry Level',
    description: 'Buy when ConnorsRSI is below this (Connors default: 10)',
    type: 'number',
    default: 10,
    min: 5,
    max: 30,
    step: 5,
  },
  {
    key: 'exitLevel',
    name: 'Exit Level',
    description: 'Sell when ConnorsRSI is above this (Connors default: 70)',
    type: 'number',
    default: 70,
    min: 50,
    max: 90,
    step: 5,
  },
  {
    key: 'rsiPeriod',
    name: 'Price RSI Period',
    description: 'RSI period of the close (Connors default: 3)',
    type: 'number',
    default: 3,
    min: 2,
    max: 5,
    step: 1,
  },
  {
    key: 'streakPeriod',
    name: 'Streak RSI Period',
    description: 'RSI period of the up/down streak (Connors default: 2)',
    type: 'number',
    default: 2,
    min: 2,
    max: 5,
    step: 1,
  },
  {
    key: 'rankPeriod',
    name: 'Rank Period',
    description: 'Bars the 1-bar change is ranked against (Connors default: 100)',
    type: 'number',
    default: 100,
    min: 50,
    max: 250,
    step: 50,
  },
  {
    key: 'trendFilter',
    name: 'Trend Filter (200 SMA)',
    description: 'Only buy when price is above the 200 SMA',
    type: 'boolean',
    default: true,
  },
];

const handler: StrategyHandler = ({ current, series, index, params, position }) => {
  const entryLevel = (params.entryLevel as number) ?? 10;
  const exitLevel = (params.exitLevel as number) ?? 70;
  const rsiPeriod = (params.rsiPeriod as number) || 3;
  const streakPeriod = (params.streakPeriod as number) || 2;
  const rankPeriod = (params.rankPeriod as number) || 100;
  const trendFilter = (params.trendFilter as boolean) ?? true;

  const crsi = getConnorsRsiArray(series, rsiPeriod, streakPeriod, rankPeriod)[index];
  if (Number.isNaN(crsi)) return { action: 'hold', reason: 'Warming up' };

  if (position === 'long') {
    if (crsi > exitLevel) return { action: 'sell', reason: `ConnorsRSI ${crsi.toFixed(1)} > ${exitLevel}` };
    return { action: 'hold', reason: '' };
  }

  const aboveTrend = !trendFilter || (current.sma200 != null && current.close > current.sma200);
  if (crsi < entryLevel && aboveTrend) {
    return { action: 'buy', reason: `ConnorsRSI ${crsi.toFixed(1)} < ${entryLevel}` };
  }
  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'connors-rsi',
  name: 'ConnorsRSI Pullback',
  description: 'Buy when ConnorsRSI (price RSI, streak RSI and change rank) drops below 10 above the 200 SMA, sell above 70. Long only.',
  handler,
  parameters,
};

export default strategy;
