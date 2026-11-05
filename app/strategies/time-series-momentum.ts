// Time-Series Momentum (Moskowitz, Ooi & Pedersen, "Time Series Momentum",
// Journal of Financial Economics, 2012)
// An asset's own trailing 12-month return predicts its next month: hold it
// while that return is positive, step aside (or short) while it's negative.
// The paper found it across 58 futures and forwards over 1985-2009; Antonacci's
// "absolute momentum" is the same rule. On daily bars 12 months is ~252 bars.
// The skip excludes the most recent bars, the "12-1" form that sidesteps the
// short-term reversal the last month tends to carry.

import { StrategyDefinition, StrategyHandler, StrategyParameter, OHLCBar } from './types';

const parameters: StrategyParameter[] = [
  {
    key: 'lookback',
    name: 'Lookback (bars)',
    description: 'Bars the trailing return is measured over (default: 252, about 12 months of daily bars)',
    type: 'number',
    default: 252,
    min: 21,
    max: 504,
    step: 21,
  },
  {
    key: 'skipBars',
    name: 'Skip Recent Bars',
    description: 'Most recent bars left out of the return (0 = plain 12-month; 21 = "12-1")',
    type: 'number',
    default: 0,
    min: 0,
    max: 63,
    step: 21,
  },
  {
    key: 'threshold',
    name: 'Threshold (%)',
    description: 'How far from zero the return must be to switch sides, against whipsaw (default: 0)',
    type: 'number',
    default: 0,
    min: 0,
    max: 10,
    step: 1,
  },
];

/** Percent return from `lookback + skip` bars ago to `skip` bars ago; NaN before there's enough history. */
export function lookbackReturn(series: OHLCBar[], index: number, lookback: number, skip: number): number {
  const end = index - skip;
  const start = end - lookback;
  if (start < 0) return NaN;
  return ((series[end].close - series[start].close) / series[start].close) * 100;
}

const handler: StrategyHandler = ({ series, index, params, position }) => {
  const lookback = (params.lookback as number) || 252;
  const skip = (params.skipBars as number) ?? 0;
  const threshold = (params.threshold as number) ?? 0;

  const ret = lookbackReturn(series, index, lookback, skip);
  if (Number.isNaN(ret)) return { action: 'hold', reason: 'Warming up' };

  const label = `${lookback}-bar return ${ret.toFixed(1)}%`;
  if (ret > threshold && position !== 'long') return { action: 'buy', reason: `${label} > ${threshold}%` };
  if (ret < -threshold && position !== 'short') return { action: 'sell', reason: `${label} < ${-threshold}%` };
  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'time-series-momentum',
  name: 'Time-Series Momentum (12-Month)',
  description: 'Hold while the trailing 12-month return is positive, exit (or short) while it is negative.',
  handler,
  parameters,
};

export default strategy;
