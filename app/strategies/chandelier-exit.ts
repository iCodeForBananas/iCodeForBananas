// Chandelier Exit Strategy
// Developed by Chuck LeBeau. An ATR-based trailing stop that keeps you in strong trends
// while exiting when momentum reverses. One of the most respected exit/entry mechanisms.
// Long: buy on new N-period high breakout; exit when close drops below (highest high - ATR * mult).
// Short: sell on new N-period low breakdown; exit when close rises above (lowest low + ATR * mult).

import { StrategyDefinition, StrategyHandler, StrategyParameter } from './types';

const parameters: StrategyParameter[] = [
  {
    key: 'period',
    name: 'Lookback Period',
    description: 'Bars for highest high / lowest low (default: 22)',
    type: 'number',
    default: 22,
    min: 5,
    max: 60,
    step: 1,
  },
  {
    key: 'atrPeriod',
    name: 'ATR Period',
    description: 'ATR calculation period (default: 22)',
    type: 'number',
    default: 22,
    min: 5,
    max: 30,
    step: 1,
  },
  {
    key: 'multiplier',
    name: 'ATR Multiplier',
    description: 'Multiplier for chandelier offset (default: 3.0)',
    type: 'number',
    default: 3.0,
    min: 1.0,
    max: 5.0,
    step: 0.5,
  },
];

const handler: StrategyHandler = ({ series, index, params }) => {
  const period = (params.period as number) ?? 22;
  const atrPeriod = (params.atrPeriod as number) ?? 22;
  const multiplier = (params.multiplier as number) ?? 3.0;

  const warmup = Math.max(period, atrPeriod) + 2;
  if (index < warmup) return { action: 'hold', reason: 'Warming up' };

  const current = series[index];
  const prev = series[index - 1];

  // Highest high and lowest low over lookback
  const lookback = series.slice(Math.max(0, index - period + 1), index + 1);
  const highestHigh = Math.max(...lookback.map((b) => b.high));
  const lowestLow = Math.min(...lookback.map((b) => b.low));

  // ATR
  const atrSlice = series.slice(Math.max(0, index - atrPeriod), index + 1);
  let atrSum = 0;
  for (let i = 1; i < atrSlice.length; i++) {
    atrSum += Math.max(
      atrSlice[i].high - atrSlice[i].low,
      Math.abs(atrSlice[i].high - atrSlice[i - 1].close),
      Math.abs(atrSlice[i].low - atrSlice[i - 1].close)
    );
  }
  const atr = atrSum / Math.max(1, atrSlice.length - 1);

  const chandelierLong = highestHigh - multiplier * atr;   // Long exit / short entry
  const chandelierShort = lowestLow + multiplier * atr;    // Short exit / long entry

  // Prev lookback for crossover detection
  const prevLookback = series.slice(Math.max(0, index - period), index);
  const prevHighestHigh = prevLookback.length > 0 ? Math.max(...prevLookback.map((b) => b.high)) : highestHigh;
  const prevLowestLow = prevLookback.length > 0 ? Math.min(...prevLookback.map((b) => b.low)) : lowestLow;
  const prevChandelierShort = prevLowestLow + multiplier * atr;
  const prevChandelierLong = prevHighestHigh - multiplier * atr;

  // Buy signal: close crosses above chandelier short stop (price was below, now above)
  if (prev.close <= prevChandelierShort && current.close > chandelierShort) {
    return { action: 'buy', reason: `Price broke above Chandelier short stop (${chandelierShort.toFixed(2)})` };
  }

  // Sell signal: close crosses below chandelier long stop
  if (prev.close >= prevChandelierLong && current.close < chandelierLong) {
    return { action: 'sell', reason: `Price broke below Chandelier long stop (${chandelierLong.toFixed(2)})` };
  }

  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'chandelier-exit',
  name: 'Chandelier Exit',
  description: 'Chuck LeBeau ATR trailing stop. Rides strong trends and exits precisely when momentum reverses.',
  handler,
  parameters,
};

export default strategy;
