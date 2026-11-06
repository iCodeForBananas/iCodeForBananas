// RSI-2 Strategy (Larry Connors)
// Very short RSI for short-term mean reversion. Widely backtested on SPY/equities.
// Buy when 2-period RSI drops below oversold threshold after price is above 200 SMA.
// Sell when 2-period RSI rises above overbought threshold.

import { StrategyDefinition, StrategyHandler, StrategyParameter } from './types';
import { getRsiArray } from './cumulative-rsi';

const parameters: StrategyParameter[] = [
  {
    key: 'oversold',
    name: 'Oversold Level',
    description: 'RSI-2 level below which to buy (Connors default: 10)',
    type: 'number',
    default: 10,
    min: 1,
    max: 30,
    step: 1,
  },
  {
    key: 'overbought',
    name: 'Overbought Level',
    description: 'RSI-2 level above which to sell (Connors default: 90)',
    type: 'number',
    default: 90,
    min: 70,
    max: 99,
    step: 1,
  },
  {
    key: 'trendFilter',
    name: 'Trend Filter (200 SMA)',
    description: 'Only buy when price is above 200 SMA (reduces whipsaws)',
    type: 'boolean',
    default: true,
  },
];

const handler: StrategyHandler = ({ current, series, index, params }) => {
  const oversold = (params.oversold as number) ?? 10;
  const overbought = (params.overbought as number) ?? 90;
  const trendFilter = (params.trendFilter as boolean) ?? true;

  // Wilder's RSI-2, computed once per series (see cumulative-rsi). Replaying
  // it from bar 1 on every call was O(n²) and stalled minute data.
  if (index < 3) return { action: 'hold', reason: 'Warming up' };
  const rsi2 = getRsiArray(series, 2)[index];

  const aboveTrend = !trendFilter || (current.sma200 != null && current.close > current.sma200);

  if (rsi2 < oversold && aboveTrend) {
    return { action: 'buy', reason: `RSI-2 oversold (${rsi2.toFixed(1)})` };
  }

  if (rsi2 > overbought) {
    return { action: 'sell', reason: `RSI-2 overbought (${rsi2.toFixed(1)})` };
  }

  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'rsi2',
  name: 'RSI-2 (Connors)',
  description: 'Larry Connors short-term mean reversion using 2-period RSI. Buy extreme pullbacks in uptrends, sell rips.',
  handler,
  parameters,
};

export default strategy;
