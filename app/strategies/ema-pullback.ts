// EMA Trend Pullback
// Two EMAs set the trend: long while the fast EMA is above the slow one. The
// entry waits for price to pull back to the fast EMA and buys the close that
// crosses back above it, rather than chasing the crossover itself. The trade
// stays on until the fast EMA crosses below the slow one. Shorts mirror it:
// fast under slow, sell the close that crosses back under the fast EMA, cover
// when the fast EMA crosses back above the slow one.
// The idea is Alexander Elder's "value zone" (Come Into My Trading Room,
// 2002): in an uptrend, buy pullbacks to the area between the fast and slow
// EMAs instead of breakouts. Linda Raschke's "Holy Grail" (Street Smarts,
// 1995) is the same pullback-to-the-20-EMA entry with an ADX filter.

import { StrategyDefinition, StrategyHandler, StrategyParameter } from './types';

const parameters: StrategyParameter[] = [
  {
    key: 'fastPeriod',
    name: 'Fast EMA Period',
    description: 'The EMA price pulls back to and has to close back across (default: 20)',
    type: 'number',
    default: 20,
    min: 5,
    max: 100,
    step: 1,
  },
  {
    key: 'slowPeriod',
    name: 'Slow EMA Period',
    description: 'The trend EMA: long only while the fast EMA is above it, short only while below (default: 50)',
    type: 'number',
    default: 50,
    min: 10,
    max: 300,
    step: 5,
  },
];

const handler: StrategyHandler = ({ current, previous, params, position }) => {
  const fastPeriod = (params.fastPeriod as number) || 20;
  const slowPeriod = (params.slowPeriod as number) || 50;
  if (fastPeriod >= slowPeriod) return { action: 'hold', reason: 'Fast period must be shorter than slow' };

  const fast = current[`ema${fastPeriod}`];
  const slow = current[`ema${slowPeriod}`];
  const prevFast = previous?.[`ema${fastPeriod}`];
  if (fast === undefined || slow === undefined || prevFast === undefined || !previous) {
    return { action: 'hold', reason: 'Waiting for EMAs' };
  }

  if (position === 'long') {
    return fast < slow
      ? { action: 'sell', reason: `EMA ${fastPeriod} crossed below EMA ${slowPeriod}` }
      : { action: 'hold', reason: '' };
  }
  if (position === 'short') {
    return fast > slow
      ? { action: 'buy', reason: `EMA ${fastPeriod} crossed above EMA ${slowPeriod}` }
      : { action: 'hold', reason: '' };
  }

  if (fast > slow && previous.close <= prevFast && current.close > fast) {
    return { action: 'buy', reason: `Uptrend: close crossed back above EMA ${fastPeriod}` };
  }
  if (fast < slow && previous.close >= prevFast && current.close < fast) {
    return { action: 'sell', reason: `Downtrend: close crossed back below EMA ${fastPeriod}` };
  }
  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'ema-pullback',
  name: 'EMA Trend Pullback',
  description:
    'With the fast EMA above the slow one, buy when the close crosses back above the fast EMA; exit when the fast EMA crosses below the slow one. Shorts mirror it.',
  handler,
  parameters,
};

export default strategy;
