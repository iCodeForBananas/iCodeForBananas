// Keltner Channel Mean Reversion Strategy
// ATR-based envelope around an EMA. Price reverting from the outer channels is the signal.
// Unlike Bollinger Bands (std dev), Keltner uses ATR — smoother and less volatile bands.

import { StrategyDefinition, StrategyHandler, StrategyParameter } from './types';

const parameters: StrategyParameter[] = [
  {
    key: 'emaPeriod',
    name: 'EMA Period',
    description: 'Center EMA period (default: 20)',
    type: 'number',
    default: 20,
    min: 5,
    max: 50,
    step: 1,
  },
  {
    key: 'atrPeriod',
    name: 'ATR Period',
    description: 'ATR period for channel width (default: 10)',
    type: 'number',
    default: 10,
    min: 5,
    max: 30,
    step: 1,
  },
  {
    key: 'multiplier',
    name: 'ATR Multiplier',
    description: 'Channel width multiplier (default: 2.0)',
    type: 'number',
    default: 2.0,
    min: 1.0,
    max: 4.0,
    step: 0.5,
  },
];

// Wilder's ATR over the whole series, seeded with the mean of the TRs of bars
// 1..period, computed once per (series, period). Replaying it from bar 1 on
// every call was O(n²) and stalled minute data. NaN until it has seeded.
const atrCache = new WeakMap<object, Map<number, number[]>>();

function wilderAtrArray(series: { high: number; low: number; close: number }[], period: number): number[] {
  let byPeriod = atrCache.get(series);
  if (!byPeriod) {
    byPeriod = new Map();
    atrCache.set(series, byPeriod);
  }
  const cached = byPeriod.get(period);
  if (cached) return cached;

  const result: number[] = new Array(series.length).fill(NaN);
  let trSum = 0;
  let atr = NaN;
  for (let i = 1; i < series.length; i++) {
    const b = series[i], pb = series[i - 1];
    const tr = Math.max(b.high - b.low, Math.abs(b.high - pb.close), Math.abs(b.low - pb.close));
    if (i <= period) {
      trSum += tr;
      if (i === period) atr = trSum / period;
    } else {
      atr = (atr * (period - 1) + tr) / period;
    }
    result[i] = atr;
  }

  byPeriod.set(period, result);
  return result;
}

const handler: StrategyHandler = ({ current, previous, series, index, params }) => {
  const emaPeriod = (params.emaPeriod as number) ?? 20;
  const atrPeriod = (params.atrPeriod as number) ?? 10;
  const multiplier = (params.multiplier as number) ?? 2.0;

  if (index < Math.max(emaPeriod, atrPeriod) + 2) {
    return { action: 'hold', reason: 'Warming up' };
  }

  const emaKey = `ema${emaPeriod}` as keyof typeof current;
  const ema = current[emaKey] as number | undefined;
  const prevEma = previous?.[emaKey] as number | undefined;

  if (!ema || !prevEma) {
    return { action: 'hold', reason: 'Waiting for indicators' };
  }

  // Each bar's bands use that bar's own ATR, so the previous bands are the
  // ones that bar actually had.
  const atrs = wilderAtrArray(series, atrPeriod);
  const atr = atrs[index];
  const prevAtr = atrs[index - 1];
  if (Number.isNaN(atr) || Number.isNaN(prevAtr)) return { action: 'hold', reason: 'Waiting for ATR' };

  const upperBand = ema + multiplier * atr;
  const lowerBand = ema - multiplier * atr;

  const prevUpper = prevEma + multiplier * prevAtr;
  const prevLower = prevEma - multiplier * prevAtr;

  // Mean reversion: buy when price crosses back above lower band (was below, now above)
  const prevClose = previous?.close ?? current.close;
  if (prevClose < prevLower && current.close > lowerBand) {
    return { action: 'buy', reason: `Price crossed back above lower Keltner band (${lowerBand.toFixed(2)})` };
  }

  // Sell when price crosses back below upper band
  if (prevClose > prevUpper && current.close < upperBand) {
    return { action: 'sell', reason: `Price crossed back below upper Keltner band (${upperBand.toFixed(2)})` };
  }

  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'keltner-channel',
  name: 'Keltner Channel',
  description: 'ATR-based envelope mean reversion. Buy when price reverts from lower band, sell from upper band.',
  handler,
  parameters,
};

export default strategy;
