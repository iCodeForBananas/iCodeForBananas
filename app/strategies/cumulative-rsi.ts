// Cumulative RSI (Larry Connors & Cesar Alvarez)
// Sum the last few readings of a short Wilder RSI. A low sum means several
// oversold bars in a row, a deeper pullback than one bar of RSI-2 alone shows.
// Buy when the sum drops below the entry level while above the 200 SMA, sell
// when the single-bar RSI recovers above the exit level. Long only.

import { StrategyDefinition, StrategyHandler, StrategyParameter, OHLCBar, IndicatorValues } from './types';

type Series = (OHLCBar & IndicatorValues)[];

// Wilder RSI over the whole series, computed once per (series, period) the way
// momentum-roc caches its smoothed ROC. NaN until the first full period.
const rsiCache = new WeakMap<Series, Map<number, number[]>>();

export function getRsiArray(series: Series, period: number): number[] {
  let byPeriod = rsiCache.get(series);
  if (!byPeriod) {
    byPeriod = new Map();
    rsiCache.set(series, byPeriod);
  }
  const cached = byPeriod.get(period);
  if (cached) return cached;

  const result: number[] = new Array(series.length).fill(NaN);
  let ag = 0, al = 0;
  for (let i = 1; i < series.length; i++) {
    const delta = series[i].close - series[i - 1].close;
    const g = delta > 0 ? delta : 0;
    const l = delta < 0 ? -delta : 0;
    if (i < period) { ag += g; al += l; }
    else if (i === period) { ag = (ag + g) / period; al = (al + l) / period; }
    else { ag = (ag * (period - 1) + g) / period; al = (al * (period - 1) + l) / period; }
    if (i >= period) result[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }

  byPeriod.set(period, result);
  return result;
}

/** Sum of the last `days` RSI readings ending at `index`, NaN if any is missing. */
export function cumulativeRsiAt(rsi: number[], index: number, days: number): number {
  if (index - days + 1 < 0) return NaN;
  let sum = 0;
  for (let i = index - days + 1; i <= index; i++) sum += rsi[i];
  return sum;
}

const parameters: StrategyParameter[] = [
  {
    key: 'rsiPeriod',
    name: 'RSI Period',
    description: 'Wilder RSI period (Connors default: 2)',
    type: 'number',
    default: 2,
    min: 2,
    max: 5,
    step: 1,
  },
  {
    key: 'sumDays',
    name: 'Days Summed',
    description: 'How many RSI readings to add up (Connors default: 2)',
    type: 'number',
    default: 2,
    min: 2,
    max: 5,
    step: 1,
  },
  {
    key: 'entryLevel',
    name: 'Entry Level',
    description: 'Buy when the summed RSI is below this (Connors default: 35)',
    type: 'number',
    default: 35,
    min: 10,
    max: 60,
    step: 5,
  },
  {
    key: 'exitLevel',
    name: 'Exit Level',
    description: 'Sell when the single-bar RSI is above this (Connors default: 65)',
    type: 'number',
    default: 65,
    min: 50,
    max: 90,
    step: 5,
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
  const rsiPeriod = (params.rsiPeriod as number) || 2;
  const sumDays = (params.sumDays as number) || 2;
  const entryLevel = (params.entryLevel as number) ?? 35;
  const exitLevel = (params.exitLevel as number) ?? 65;
  const trendFilter = (params.trendFilter as boolean) ?? true;

  const rsi = getRsiArray(series, rsiPeriod);
  const cum = cumulativeRsiAt(rsi, index, sumDays);
  if (Number.isNaN(cum)) return { action: 'hold', reason: 'Warming up' };

  if (position === 'long') {
    if (rsi[index] > exitLevel) {
      return { action: 'sell', reason: `RSI(${rsiPeriod}) ${rsi[index].toFixed(1)} > ${exitLevel}` };
    }
    return { action: 'hold', reason: '' };
  }

  const aboveTrend = !trendFilter || (current.sma200 != null && current.close > current.sma200);
  if (cum < entryLevel && aboveTrend) {
    return { action: 'buy', reason: `Cumulative RSI ${cum.toFixed(1)} < ${entryLevel}` };
  }

  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'cumulative-rsi',
  name: 'Cumulative RSI (Connors)',
  description: 'Buy when the sum of the last few RSI-2 readings is deeply oversold above the 200 SMA, sell when RSI-2 recovers. Long only.',
  handler,
  parameters,
};

export default strategy;
