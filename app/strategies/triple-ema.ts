// Triple EMA Crossover Strategy
// Classic 3-line EMA system (popularized by R.C. Allen). Buy when fast > mid > slow all aligned.
// Default periods: 4 / 9 / 18 (Allen's original); also popular: 5/10/20 and 8/13/21.

import { StrategyDefinition, StrategyHandler, StrategyParameter } from './types';

const parameters: StrategyParameter[] = [
  {
    key: 'fastPeriod',
    name: 'Fast EMA',
    description: 'Fastest EMA period (default: 4)',
    type: 'number',
    default: 4,
    min: 2,
    max: 20,
    step: 1,
  },
  {
    key: 'midPeriod',
    name: 'Mid EMA',
    description: 'Middle EMA period (default: 9)',
    type: 'number',
    default: 9,
    min: 5,
    max: 50,
    step: 1,
  },
  {
    key: 'slowPeriod',
    name: 'Slow EMA',
    description: 'Slowest EMA period (default: 18)',
    type: 'number',
    default: 18,
    min: 10,
    max: 100,
    step: 1,
  },
];

const handler: StrategyHandler = ({ current, previous, params }) => {
  const fastPeriod = (params.fastPeriod as number) ?? 4;
  const midPeriod = (params.midPeriod as number) ?? 9;
  const slowPeriod = (params.slowPeriod as number) ?? 18;

  const fastKey = `ema${fastPeriod}` as keyof typeof current;
  const midKey = `ema${midPeriod}` as keyof typeof current;
  const slowKey = `ema${slowPeriod}` as keyof typeof current;

  const curFast = current[fastKey] as number | undefined;
  const curMid = current[midKey] as number | undefined;
  const curSlow = current[slowKey] as number | undefined;
  const prevFast = previous?.[fastKey] as number | undefined;
  const prevMid = previous?.[midKey] as number | undefined;
  const prevSlow = previous?.[slowKey] as number | undefined;

  if (!curFast || !curMid || !curSlow || !prevFast || !prevMid || !prevSlow) {
    return { action: 'hold', reason: 'Warming up' };
  }

  const bullishNow = curFast > curMid && curMid > curSlow;
  const bullishPrev = prevFast > prevMid && prevMid > prevSlow;
  const bearishNow = curFast < curMid && curMid < curSlow;
  const bearishPrev = prevFast < prevMid && prevMid < prevSlow;

  // Entry: all three align for the first time
  if (bullishNow && !bullishPrev) {
    return { action: 'buy', reason: `Triple EMA bullish alignment (${fastPeriod}>${midPeriod}>${slowPeriod})` };
  }

  if (bearishNow && !bearishPrev) {
    return { action: 'sell', reason: `Triple EMA bearish alignment (${fastPeriod}<${midPeriod}<${slowPeriod})` };
  }

  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'triple-ema',
  name: 'Triple EMA (Allen)',
  description: 'R.C. Allen 3-EMA system. Buy when fast > mid > slow align bullishly, sell on bearish alignment.',
  handler,
  parameters,
};

export default strategy;
