// IBS Trend (directional IBS mean reversion)
// IBS = (close - low) / (high - low): 0 means the bar closed on its low, 1 on its high.
// Mean reversion only in the direction of the trend: buy a close near the low
// while price is above its SMA (a dip in an uptrend), short a close near the
// high while price is below it (a pop in a downtrend). Exit when a bar closes
// at the other end of its range, or, with the trend exit on, when price closes
// through the SMA against the position: the trend that justified the trade is gone.
// Unlike IBS Mean Reversion's trend filter (fixed 200 SMA, entries only), the
// SMA length is a parameter and the trend can close the position.

import { ibs } from './ibs-mean-reversion';
import { StrategyDefinition, StrategyHandler, StrategyParameter } from './types';

const parameters: StrategyParameter[] = [
  {
    key: 'entryIbs',
    name: 'Entry IBS (%)',
    description: 'Buy above the SMA when IBS closes below this percent of the range; short below the SMA when it closes above 100 minus this (default: 20)',
    type: 'number',
    default: 20,
    min: 5,
    max: 40,
    step: 5,
  },
  {
    key: 'exitIbs',
    name: 'Exit IBS (%)',
    description: 'Sell a long when IBS closes above this percent; cover a short when it closes below 100 minus this (default: 80)',
    type: 'number',
    default: 80,
    min: 50,
    max: 95,
    step: 5,
  },
  {
    key: 'smaPeriod',
    name: 'Trend SMA Period',
    description: 'Simple moving average that sets the direction: long only above it, short only below it (default: 200)',
    type: 'number',
    default: 200,
    // A sweep covers the whole range, from a 5-bar average to a 250-bar one.
    min: 5,
    max: 250,
    step: 5,
  },
  {
    key: 'trendExit',
    name: 'Exit on Trend Break',
    description: 'Also close a long when price closes below the SMA, and a short when it closes above (default: on)',
    type: 'boolean',
    default: true,
  },
];

const handler: StrategyHandler = ({ current, params, position }) => {
  // Parameters are percents so a sweep's steps stay whole numbers.
  const entryIbs = ((params.entryIbs as number) ?? 20) / 100;
  const exitIbs = ((params.exitIbs as number) ?? 80) / 100;
  const smaPeriod = (params.smaPeriod as number) || 200;
  const trendExit = (params.trendExit as boolean) ?? true;

  const sma = current[`sma${smaPeriod}` as keyof typeof current] as number | undefined;
  if (sma === undefined) return { action: 'hold', reason: `Waiting for SMA ${smaPeriod}` };

  const value = ibs(current);
  const above = current.close > sma;
  const below = current.close < sma;

  if (position === 'long') {
    if (value > exitIbs) return { action: 'sell', reason: `IBS ${value.toFixed(2)} > ${exitIbs.toFixed(2)}` };
    if (trendExit && below) return { action: 'sell', reason: `Close below SMA ${smaPeriod} (${sma.toFixed(2)})` };
    return { action: 'hold', reason: '' };
  }
  if (position === 'short') {
    const coverIbs = 1 - exitIbs;
    if (value < coverIbs) return { action: 'buy', reason: `IBS ${value.toFixed(2)} < ${coverIbs.toFixed(2)}` };
    if (trendExit && above) return { action: 'buy', reason: `Close above SMA ${smaPeriod} (${sma.toFixed(2)})` };
    return { action: 'hold', reason: '' };
  }

  if (above && value < entryIbs) {
    return { action: 'buy', reason: `IBS ${value.toFixed(2)} < ${entryIbs.toFixed(2)} above SMA ${smaPeriod}` };
  }
  // The engine opens a short on this only when shorts are enabled.
  const shortIbs = 1 - entryIbs;
  if (below && value > shortIbs) {
    return { action: 'sell', reason: `IBS ${value.toFixed(2)} > ${shortIbs.toFixed(2)} below SMA ${smaPeriod}` };
  }
  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'ibs-trend',
  name: 'IBS Trend (Directional)',
  description:
    'IBS mean reversion in the direction of an SMA trend: buy a close near the low above the SMA, short a close near the high below it. Exits at the other end of the range, or when price closes through the SMA against the position.',
  handler,
  parameters,
};

export default strategy;
