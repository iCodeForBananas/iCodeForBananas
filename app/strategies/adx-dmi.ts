// ADX / Directional Movement (J. Welles Wilder, "New Concepts in Technical
// Trading Systems", 1978)
// +DI measures how much of the recent range came from higher highs, -DI from
// lower lows, both as Wilder-smoothed shares of true range. ADX is the
// smoothed spread between them: how strongly the market is trending, in
// either direction. Wilder's rule: be long while +DI is above -DI, short while
// -DI is above +DI, and only take a new trade when ADX says there's a trend
// worth trading. ADX is the standard regime filter trend followers put in
// front of crossover systems to sit out ranges.

import { StrategyDefinition, StrategyHandler, StrategyParameter, OHLCBar } from './types';

export interface DmiArrays {
  plusDi: number[];
  minusDi: number[];
  adx: number[];
}

const dmiCache = new WeakMap<object, Map<number, DmiArrays>>();

/** Wilder's +DI, -DI and ADX for every bar, NaN until each has seeded. */
export function getDmi(series: OHLCBar[], period: number): DmiArrays {
  let byPeriod = dmiCache.get(series);
  if (!byPeriod) {
    byPeriod = new Map();
    dmiCache.set(series, byPeriod);
  }
  const cached = byPeriod.get(period);
  if (cached) return cached;

  const n = series.length;
  const plusDi = new Array<number>(n).fill(NaN);
  const minusDi = new Array<number>(n).fill(NaN);
  const adx = new Array<number>(n).fill(NaN);
  let tr = 0, pdm = 0, mdm = 0;
  let dxSum = 0, dxCount = 0, adxValue = NaN;
  for (let i = 1; i < n; i++) {
    const b = series[i], p = series[i - 1];
    const up = b.high - p.high;
    const down = p.low - b.low;
    const trueRange = Math.max(b.high - b.low, Math.abs(b.high - p.close), Math.abs(b.low - p.close));
    const plusDm = up > down && up > 0 ? up : 0;
    const minusDm = down > up && down > 0 ? down : 0;
    if (i <= period) {
      // Wilder seeds the smoothed sums with plain sums of the first period.
      tr += trueRange;
      pdm += plusDm;
      mdm += minusDm;
      if (i < period) continue;
    } else {
      tr = tr - tr / period + trueRange;
      pdm = pdm - pdm / period + plusDm;
      mdm = mdm - mdm / period + minusDm;
    }
    const pdi = tr > 0 ? (100 * pdm) / tr : 0;
    const mdi = tr > 0 ? (100 * mdm) / tr : 0;
    plusDi[i] = pdi;
    minusDi[i] = mdi;
    const dx = pdi + mdi > 0 ? (100 * Math.abs(pdi - mdi)) / (pdi + mdi) : 0;
    if (dxCount < period) {
      dxSum += dx;
      dxCount++;
      if (dxCount === period) adxValue = dxSum / period;
    } else {
      adxValue = (adxValue * (period - 1) + dx) / period;
    }
    adx[i] = adxValue;
  }

  const result = { plusDi, minusDi, adx };
  byPeriod.set(period, result);
  return result;
}

const parameters: StrategyParameter[] = [
  {
    key: 'period',
    name: 'DI / ADX Period',
    description: 'Wilder smoothing length for +DI, -DI and ADX (Wilder: 14)',
    type: 'number',
    default: 14,
    min: 5,
    max: 50,
    step: 1,
  },
  {
    key: 'adxThreshold',
    name: 'ADX Threshold',
    description: 'Only enter while ADX is above this: the market is trending (common: 20 to 25)',
    type: 'number',
    default: 20,
    min: 0,
    max: 50,
    step: 5,
  },
];

const handler: StrategyHandler = ({ series, index, params, position }) => {
  const period = (params.period as number) || 14;
  const threshold = (params.adxThreshold as number) ?? 20;
  const { plusDi, minusDi, adx } = getDmi(series, period);
  const pdi = plusDi[index], mdi = minusDi[index], a = adx[index];
  if ([pdi, mdi, a].some(Number.isNaN)) return { action: 'hold', reason: 'Warming up' };

  if (position === 'long') {
    return mdi > pdi ? { action: 'sell', reason: `-DI ${mdi.toFixed(1)} crossed above +DI ${pdi.toFixed(1)}` } : { action: 'hold', reason: '' };
  }
  if (position === 'short') {
    return pdi > mdi ? { action: 'buy', reason: `+DI ${pdi.toFixed(1)} crossed above -DI ${mdi.toFixed(1)}` } : { action: 'hold', reason: '' };
  }
  if (a <= threshold) return { action: 'hold', reason: '' };
  if (pdi > mdi) return { action: 'buy', reason: `+DI over -DI, ADX ${a.toFixed(1)}` };
  if (mdi > pdi) return { action: 'sell', reason: `-DI over +DI, ADX ${a.toFixed(1)}` };
  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'adx-dmi',
  name: 'ADX / DMI Trend (Wilder)',
  description: 'Long while +DI is above -DI and short while below, entering only when ADX shows a trend; exit when the DIs cross back.',
  handler,
  parameters,
};

export default strategy;
