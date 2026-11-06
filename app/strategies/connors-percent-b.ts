// %b Strategy (Larry Connors & Cesar Alvarez, "High Probability ETF Trading", 2009)
// %b places the close inside its Bollinger Bands: 0 at the lower band, 1 at
// the upper. Connors uses tight 5-bar, 1-standard-deviation bands and waits
// for several closes in a row in the bottom of them, above the 200-day SMA,
// then sells once a close reaches the top. It's a pullback buy in an uptrend
// that needs the weakness to last, not a single touch of the band like the
// classic Bollinger rule. Shorts mirror it below the 200 SMA.

import { StrategyDefinition, StrategyHandler, StrategyParameter, OHLCBar } from './types';

const pctBCache = new WeakMap<object, Map<string, number[]>>();

/** Bollinger %b of each close (population standard deviation), NaN until the window fills. */
export function getPercentB(series: OHLCBar[], period: number, stdDev: number): number[] {
  let byKey = pctBCache.get(series);
  if (!byKey) {
    byKey = new Map();
    pctBCache.set(series, byKey);
  }
  const key = `${period}_${stdDev}`;
  const cached = byKey.get(key);
  if (cached) return cached;
  const out = new Array<number>(series.length).fill(NaN);
  for (let i = period - 1; i < series.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += series[j].close;
    const mean = sum / period;
    let sq = 0;
    for (let j = i - period + 1; j <= i; j++) sq += (series[j].close - mean) ** 2;
    const sd = Math.sqrt(sq / period);
    out[i] = sd > 0 ? (series[i].close - (mean - stdDev * sd)) / (2 * stdDev * sd) : 0.5;
  }
  byKey.set(key, out);
  return out;
}

const parameters: StrategyParameter[] = [
  {
    key: 'period',
    name: 'Band Period',
    description: 'Bollinger Band length (Connors: 5)',
    type: 'number',
    default: 5,
    min: 3,
    max: 30,
    step: 1,
  },
  {
    key: 'stdDev',
    name: 'Standard Deviations',
    description: 'Band width (Connors: 1)',
    type: 'number',
    default: 1,
    min: 0.5,
    max: 3,
    step: 0.5,
  },
  {
    key: 'days',
    name: 'Days Below',
    description: 'Closes in a row %b must stay under the entry level (Connors: 3)',
    type: 'number',
    default: 3,
    min: 1,
    max: 6,
    step: 1,
  },
  {
    key: 'entryPctB',
    name: 'Entry %b (%)',
    description: 'Buy after that many closes under this %b, as a percent of the band (Connors: 20)',
    type: 'number',
    default: 20,
    min: 0,
    max: 50,
    step: 5,
  },
  {
    key: 'exitPctB',
    name: 'Exit %b (%)',
    description: 'Sell when %b closes above this (Connors: 80)',
    type: 'number',
    default: 80,
    min: 50,
    max: 100,
    step: 5,
  },
  {
    key: 'trendFilter',
    name: 'Trend Filter (200 SMA)',
    description: 'Only buy above the 200 SMA, and only short below it',
    type: 'boolean',
    default: true,
  },
];

const handler: StrategyHandler = ({ current, series, index, params, position }) => {
  const period = (params.period as number) || 5;
  const stdDev = (params.stdDev as number) || 1;
  const days = Math.max(1, Math.round((params.days as number) || 3));
  const entry = ((params.entryPctB as number) ?? 20) / 100;
  const exit = ((params.exitPctB as number) ?? 80) / 100;
  const trendFilter = (params.trendFilter as boolean) ?? true;

  const pctB = getPercentB(series, period, stdDev);
  const b = pctB[index];
  if (Number.isNaN(b) || index - days + 1 < 0) return { action: 'hold', reason: 'Warming up' };

  if (position === 'long') {
    return b > exit ? { action: 'sell', reason: `%b ${b.toFixed(2)} > ${exit}` } : { action: 'hold', reason: '' };
  }
  if (position === 'short') {
    return b < 1 - exit ? { action: 'buy', reason: `%b ${b.toFixed(2)} < ${(1 - exit).toFixed(2)}` } : { action: 'hold', reason: '' };
  }

  let allLow = true, allHigh = true;
  for (let i = index - days + 1; i <= index; i++) {
    if (!(pctB[i] < entry)) allLow = false;
    if (!(pctB[i] > 1 - entry)) allHigh = false;
  }
  const sma = current.sma200;
  if (allLow && (!trendFilter || (sma != null && current.close > sma))) {
    return { action: 'buy', reason: `%b under ${entry} for ${days} closes` };
  }
  if (allHigh && (!trendFilter || (sma != null && current.close < sma))) {
    return { action: 'sell', reason: `%b over ${(1 - entry).toFixed(2)} for ${days} closes` };
  }
  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'connors-percent-b',
  name: '%b (Connors)',
  description: 'Above the 200 SMA, buy after three closes in a row in the bottom 20% of 5-bar, 1-sigma Bollinger Bands; sell when %b closes above 80%. Shorts mirror it.',
  handler,
  parameters,
};

export default strategy;
