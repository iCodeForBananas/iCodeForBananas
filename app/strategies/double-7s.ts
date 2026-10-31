// Double 7s (Larry Connors & Cesar Alvarez, "Short Term Trading Strategies That Work")
// Buy when the close is the lowest close of the last 7 bars while price is above
// the 200 SMA. Sell when the close is the highest close of the last 7 bars.
// Long-only: buys pullbacks inside an uptrend.

import { StrategyDefinition, StrategyHandler, StrategyParameter } from './types';

const parameters: StrategyParameter[] = [
  {
    key: 'lookback',
    name: 'Lookback',
    description: 'Bars for the lowest/highest close (Connors default: 7)',
    type: 'number',
    default: 7,
    min: 3,
    max: 20,
    step: 1,
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
  const lookback = (params.lookback as number) || 7;
  const trendFilter = (params.trendFilter as boolean) ?? true;

  if (index < lookback - 1) return { action: 'hold', reason: 'Warming up' };

  // Window includes the current bar, so "lowest of the last 7" means today's
  // close is at or below every close in it.
  let lowest = Infinity;
  let highest = -Infinity;
  for (let i = index - lookback + 1; i <= index; i++) {
    lowest = Math.min(lowest, series[i].close);
    highest = Math.max(highest, series[i].close);
  }

  if (position === 'long') {
    if (current.close >= highest) {
      return { action: 'sell', reason: `${lookback}-bar closing high (${current.close.toFixed(2)})` };
    }
    return { action: 'hold', reason: '' };
  }

  const aboveTrend = !trendFilter || (current.sma200 != null && current.close > current.sma200);
  if (current.close <= lowest && aboveTrend) {
    return { action: 'buy', reason: `${lookback}-bar closing low (${current.close.toFixed(2)})` };
  }

  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'double-7s',
  name: 'Double 7s (Connors)',
  description: 'Buy a 7-bar closing low above the 200 SMA, sell a 7-bar closing high. Long only.',
  handler,
  parameters,
};

export default strategy;
