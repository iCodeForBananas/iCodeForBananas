// IBS (Internal Bar Strength) Mean Reversion
// IBS = (close - low) / (high - low): 0 means the bar closed on its low, 1 on its high.
// Index ETFs (SPY, QQQ) have shown a persistent next-day bounce after closes near
// the low of the day. Buy when IBS is low, exit when a bar closes near its high.
// The published edge is on the long side. The short side mirrors it (short a
// close near the high, cover a close near the low) and only trades when shorts
// are enabled in the backtester; expect it to be weaker on rising markets.

import { StrategyDefinition, StrategyHandler, StrategyParameter } from './types';

const parameters: StrategyParameter[] = [
  {
    key: 'entryIbs',
    name: 'Entry IBS (%)',
    description: 'Buy when IBS closes below this percent of the range (default: 20)',
    type: 'number',
    default: 20,
    min: 5,
    max: 40,
    step: 5,
  },
  {
    key: 'exitIbs',
    name: 'Exit IBS (%)',
    description: 'Sell when IBS closes above this percent of the range (default: 80)',
    type: 'number',
    default: 80,
    min: 50,
    max: 95,
    step: 5,
  },
  {
    key: 'trendFilter',
    name: 'Trend Filter (200 SMA)',
    description: 'Only buy above the 200 SMA, and only short below it',
    type: 'boolean',
    default: false,
  },
];

export function ibs(bar: { high: number; low: number; close: number }): number {
  const range = bar.high - bar.low;
  return range === 0 ? 0.5 : (bar.close - bar.low) / range;
}

const handler: StrategyHandler = ({ current, params, position }) => {
  // Parameters are percents so a sweep's steps stay whole numbers.
  const entryIbs = ((params.entryIbs as number) ?? 20) / 100;
  const exitIbs = ((params.exitIbs as number) ?? 80) / 100;
  const trendFilter = (params.trendFilter as boolean) ?? false;

  const value = ibs(current);
  // The short side mirrors the thresholds around the middle of the range.
  const shortEntryIbs = 1 - entryIbs;
  const shortExitIbs = 1 - exitIbs;

  if (position === 'long') {
    if (value > exitIbs) {
      return { action: 'sell', reason: `IBS ${value.toFixed(2)} > ${exitIbs}` };
    }
    return { action: 'hold', reason: '' };
  }
  if (position === 'short') {
    if (value < shortExitIbs) {
      return { action: 'buy', reason: `IBS ${value.toFixed(2)} < ${shortExitIbs.toFixed(2)}` };
    }
    return { action: 'hold', reason: '' };
  }

  const sma = current.sma200;
  const aboveTrend = !trendFilter || (sma != null && current.close > sma);
  const belowTrend = !trendFilter || (sma != null && current.close < sma);
  if (value < entryIbs && aboveTrend) {
    return { action: 'buy', reason: `IBS ${value.toFixed(2)} < ${entryIbs}` };
  }
  // The engine opens a short on this only when shorts are enabled.
  if (value > shortEntryIbs && belowTrend) {
    return { action: 'sell', reason: `IBS ${value.toFixed(2)} > ${shortEntryIbs.toFixed(2)}` };
  }

  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'ibs-mean-reversion',
  name: 'IBS Mean Reversion',
  description: 'Buy when a bar closes near its low (low Internal Bar Strength), sell when one closes near its high. With shorts enabled, short a close near the high and cover a close near the low.',
  handler,
  parameters,
};

export default strategy;
