// Rate of Change (ROC) Momentum Strategy
// One of the simplest and most empirically validated strategies: buy assets with
// strong recent momentum, sell when momentum rolls over.
// Popularized by Jegadeesh & Titman (1993) and used in dual-momentum (Gary Antonacci).

import { StrategyDefinition, StrategyHandler, StrategyParameter } from './types';

const parameters: StrategyParameter[] = [
  {
    key: 'rocPeriod',
    name: 'ROC Period',
    description: 'Lookback bars for rate of change (default: 20)',
    type: 'number',
    default: 20,
    min: 5,
    max: 120,
    step: 5,
  },
  {
    key: 'entryThreshold',
    name: 'Entry Threshold (%)',
    description: 'Minimum ROC % to trigger a buy (default: 2.0)',
    type: 'number',
    default: 2.0,
    min: 0.0,
    max: 20.0,
    step: 0.5,
  },
  {
    key: 'exitThreshold',
    name: 'Exit Threshold (%)',
    description: 'ROC % below which to sell (default: 0.0)',
    type: 'number',
    default: 0.0,
    min: -10.0,
    max: 5.0,
    step: 0.5,
  },
  {
    key: 'smoothing',
    name: 'Signal Smoothing (EMA)',
    description: 'EMA period to smooth ROC signal, 0 = off (default: 5)',
    type: 'number',
    default: 5,
    min: 0,
    max: 20,
    step: 1,
  },
];

const handler: StrategyHandler = ({ series, index, params }) => {
  const rocPeriod = (params.rocPeriod as number) ?? 20;
  const entryThreshold = (params.entryThreshold as number) ?? 2.0;
  const exitThreshold = (params.exitThreshold as number) ?? 0.0;
  const smoothing = (params.smoothing as number) ?? 5;

  if (index < rocPeriod + 1) return { action: 'hold', reason: 'Warming up' };

  const current = series[index];
  const past = series[index - rocPeriod];
  const rawRoc = ((current.close - past.close) / past.close) * 100;

  // Optional EMA smoothing of ROC
  let roc = rawRoc;
  if (smoothing > 1 && index >= rocPeriod + smoothing) {
    const mult = 2 / (smoothing + 1);
    let ema = ((series[rocPeriod].close - series[0].close) / series[0].close) * 100;
    for (let i = rocPeriod + 1; i <= index; i++) {
      const r = ((series[i].close - series[i - rocPeriod].close) / series[i - rocPeriod].close) * 100;
      ema = (r - ema) * mult + ema;
    }
    roc = ema;
  }

  const prev = series[index - 1];
  const pastPrev = series[index - 1 - rocPeriod];
  const prevRoc = ((prev.close - pastPrev.close) / pastPrev.close) * 100;

  // Crossover above entry threshold → buy
  if (prevRoc < entryThreshold && roc >= entryThreshold) {
    return { action: 'buy', reason: `ROC momentum ${roc.toFixed(2)}% crossed above entry ${entryThreshold}%` };
  }

  // Cross below exit threshold → sell
  if (prevRoc > exitThreshold && roc <= exitThreshold) {
    return { action: 'sell', reason: `ROC momentum ${roc.toFixed(2)}% crossed below exit ${exitThreshold}%` };
  }

  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'momentum-roc',
  name: 'Momentum (ROC)',
  description: 'Rate of Change momentum strategy. Buy strong upward momentum, exit when it fades. Based on Jegadeesh & Titman research.',
  handler,
  parameters,
};

export default strategy;
