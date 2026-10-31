// Moving Average Trend Filter (Mebane Faber, "A Quantitative Approach to Tactical
// Asset Allocation", 2007)
// Hold while price is above its long moving average, step aside when it falls
// below. Faber used a 10-month SMA; on daily bars that is roughly 200 days.
// It mostly earns its keep by sidestepping bear markets, not by beating a bull.
// The band keeps a close that hovers on the average from flipping every bar.

import { StrategyDefinition, StrategyHandler, StrategyParameter } from './types';

const parameters: StrategyParameter[] = [
  {
    key: 'smaPeriod',
    name: 'SMA Period',
    description: 'Moving average length in bars (default: 200, about 10 months of daily bars)',
    type: 'number',
    default: 200,
    min: 50,
    max: 250,
    step: 25,
  },
  {
    key: 'bandPercent',
    name: 'Band (%)',
    description: 'How far past the SMA a close must be to switch (default: 1)',
    type: 'number',
    default: 1,
    min: 0,
    max: 5,
    step: 0.5,
  },
];

const handler: StrategyHandler = ({ current, params }) => {
  const smaPeriod = (params.smaPeriod as number) || 200;
  const band = ((params.bandPercent as number) ?? 1) / 100;

  const sma = current[`sma${smaPeriod}` as keyof typeof current] as number | undefined;
  if (sma === undefined) return { action: 'hold', reason: 'Waiting for SMA' };

  if (current.close > sma * (1 + band)) {
    return { action: 'buy', reason: `Close above SMA ${smaPeriod} (${sma.toFixed(2)})` };
  }
  if (current.close < sma * (1 - band)) {
    return { action: 'sell', reason: `Close below SMA ${smaPeriod} (${sma.toFixed(2)})` };
  }

  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'faber-trend',
  name: 'MA Trend Filter (Faber)',
  description: 'Hold while price is above its 200-day (10-month) SMA, exit when it closes below. Faber\'s tactical allocation rule.',
  handler,
  parameters,
};

export default strategy;
