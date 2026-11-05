// Kaufman Adaptive Moving Average (Perry Kaufman, "Smarter Trading", 1995;
// "Trading Systems and Methods")
// The efficiency ratio, net move over the sum of bar-to-bar moves, says how
// cleanly price is trending. KAMA speeds up toward a 2-bar EMA when it is
// high and slows toward a 30-bar EMA in chop, so it lies flat through noise
// and turns quickly once a trend starts.
// Kaufman's rule trades the turns of KAMA itself: buy once it has risen more
// than a filter off its recent low, sell once it has fallen that far off its
// recent high. The filter is a multiple of the standard deviation of KAMA's
// recent bar-to-bar changes, so it scales with the instrument.

import { StrategyDefinition, StrategyHandler, StrategyParameter, OHLCBar } from './types';

const kamaCache = new WeakMap<OHLCBar[], Map<string, number[]>>();

export function getKamaArray(series: OHLCBar[], erPeriod: number, fastLength: number, slowLength: number): number[] {
  let byKey = kamaCache.get(series);
  if (!byKey) {
    byKey = new Map();
    kamaCache.set(series, byKey);
  }
  const key = `${erPeriod}_${fastLength}_${slowLength}`;
  const cached = byKey.get(key);
  if (cached) return cached;

  const fast = 2 / (fastLength + 1);
  const slow = 2 / (slowLength + 1);
  const result: number[] = new Array(series.length).fill(NaN);
  if (series.length > erPeriod) {
    // Running sum of |close - prev close| over the ER window.
    let noise = 0;
    for (let i = 1; i <= erPeriod; i++) noise += Math.abs(series[i].close - series[i - 1].close);
    result[erPeriod] = series[erPeriod].close;
    for (let i = erPeriod + 1; i < series.length; i++) {
      noise += Math.abs(series[i].close - series[i - 1].close) - Math.abs(series[i - erPeriod].close - series[i - erPeriod - 1].close);
      const signal = Math.abs(series[i].close - series[i - erPeriod].close);
      const er = noise > 0 ? signal / noise : 0;
      const sc = (er * (fast - slow) + slow) ** 2;
      result[i] = result[i - 1] + sc * (series[i].close - result[i - 1]);
    }
  }

  byKey.set(key, result);
  return result;
}

/** Kaufman's filter at `index`: `mult` standard deviations of the last `window` KAMA changes. */
export function kamaFilterAt(kama: number[], index: number, window: number, mult: number): number {
  if (index - window < 0 || Number.isNaN(kama[index - window])) return NaN;
  let sum = 0, sumSq = 0;
  for (let i = index - window + 1; i <= index; i++) {
    const d = kama[i] - kama[i - 1];
    sum += d;
    sumSq += d * d;
  }
  const mean = sum / window;
  return mult * Math.sqrt(Math.max(0, sumSq / window - mean * mean));
}

const FILTER_WINDOW = 20;

const parameters: StrategyParameter[] = [
  {
    key: 'erPeriod',
    name: 'Efficiency Ratio Period',
    description: 'Bars the efficiency ratio is measured over (Kaufman: 10)',
    type: 'number',
    default: 10,
    min: 5,
    max: 30,
    step: 5,
  },
  {
    key: 'fastLength',
    name: 'Fast Length',
    description: 'EMA length KAMA tracks in a clean trend (Kaufman: 2)',
    type: 'number',
    default: 2,
    min: 2,
    max: 5,
    step: 1,
  },
  {
    key: 'slowLength',
    name: 'Slow Length',
    description: 'EMA length KAMA tracks in chop (Kaufman: 30)',
    type: 'number',
    default: 30,
    min: 20,
    max: 60,
    step: 10,
  },
  {
    key: 'filterMult',
    name: 'Filter (std devs)',
    description: 'How far KAMA must turn, in standard deviations of its last 20 changes (Kaufman: 0.1 for futures, up to 1 for stocks)',
    type: 'number',
    default: 0.5,
    min: 0,
    max: 2,
    step: 0.25,
  },
  {
    key: 'turnBars',
    name: 'Turn Lookback',
    description: 'Bars back to find the recent KAMA low or high the turn is measured from (default: 5)',
    type: 'number',
    default: 5,
    min: 2,
    max: 20,
    step: 1,
  },
];

const handler: StrategyHandler = ({ series, index, params, position }) => {
  const erPeriod = (params.erPeriod as number) || 10;
  const fastLength = (params.fastLength as number) || 2;
  const slowLength = (params.slowLength as number) || 30;
  const filterMult = (params.filterMult as number) ?? 0.5;
  const turnBars = (params.turnBars as number) || 5;

  const kama = getKamaArray(series, erPeriod, fastLength, slowLength);
  const filter = kamaFilterAt(kama, index, FILTER_WINDOW, filterMult);
  if (Number.isNaN(filter) || index - turnBars < 0 || Number.isNaN(kama[index - turnBars])) {
    return { action: 'hold', reason: 'Warming up' };
  }

  let low = Infinity, high = -Infinity;
  for (let i = index - turnBars; i < index; i++) {
    low = Math.min(low, kama[i]);
    high = Math.max(high, kama[i]);
  }
  const now = kama[index];

  if (now - low > filter && position !== 'long') {
    return { action: 'buy', reason: `KAMA ${now.toFixed(2)} turned up ${(now - low).toFixed(2)} > filter ${filter.toFixed(2)}` };
  }
  if (high - now > filter && position !== 'short') {
    return { action: 'sell', reason: `KAMA ${now.toFixed(2)} turned down ${(high - now).toFixed(2)} > filter ${filter.toFixed(2)}` };
  }
  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'kama-trend',
  name: 'Kaufman Adaptive MA (KAMA)',
  description: 'Trade the turns of an adaptive moving average that flattens in chop and speeds up in trends, past a volatility filter.',
  handler,
  parameters,
};

export default strategy;
