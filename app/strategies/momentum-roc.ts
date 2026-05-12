// Rate of Change (ROC) Momentum Strategy
// One of the simplest and most empirically validated strategies: buy assets with
// strong recent momentum, sell when momentum rolls over.
// Popularized by Jegadeesh & Titman (1993) and used in dual-momentum (Gary Antonacci).

import { StrategyDefinition, StrategyHandler, StrategyParameter, OHLCBar, IndicatorValues } from './types';

type Series = (OHLCBar & IndicatorValues)[];

// WeakMap cache so the smoothed ROC array is computed once per (series, rocPeriod, smoothing)
// triple rather than on every bar call. Keyed on the series array reference so entries are
// automatically GC'd when the backtest run releases the series.
const rocEmaCache = new WeakMap<Series, Map<string, number[]>>();

function getSmoothedRocArray(series: Series, rocPeriod: number, smoothing: number): number[] {
  let seriesMap = rocEmaCache.get(series);
  if (!seriesMap) {
    seriesMap = new Map();
    rocEmaCache.set(series, seriesMap);
  }

  const cacheKey = `${rocPeriod}_${smoothing}`;
  const cached = seriesMap.get(cacheKey);
  if (cached) return cached;

  // Single O(n) pass — seed with the first computable raw ROC, then apply EMA forward.
  const mult = 2 / (smoothing + 1);
  const result: number[] = new Array(series.length).fill(NaN);

  let ema = ((series[rocPeriod].close - series[0].close) / series[0].close) * 100;
  result[rocPeriod] = ema;

  for (let i = rocPeriod + 1; i < series.length; i++) {
    const r = ((series[i].close - series[i - rocPeriod].close) / series[i - rocPeriod].close) * 100;
    ema = (r - ema) * mult + ema;
    result[i] = ema;
  }

  seriesMap.set(cacheKey, result);
  return result;
}

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
  const rocPeriod      = (params.rocPeriod      as number) ?? 20;
  const entryThreshold = (params.entryThreshold as number) ?? 2.0;
  const exitThreshold  = (params.exitThreshold  as number) ?? 0.0;
  const smoothing      = (params.smoothing      as number) ?? 5;

  if (index < rocPeriod + 1) return { action: 'hold', reason: 'Warming up' };

  // Raw ROC values — O(1) array lookups
  const roc     = ((series[index].close     - series[index - rocPeriod].close)     / series[index - rocPeriod].close)     * 100;
  const prevRoc = ((series[index - 1].close - series[index - 1 - rocPeriod].close) / series[index - 1 - rocPeriod].close) * 100;

  // Optional EMA smoothing: O(1) lookup into a pre-computed array.
  // The array is built once per (series, rocPeriod, smoothing) triple on first access.
  let smoothedRoc     = roc;
  let smoothedPrevRoc = prevRoc;

  if (smoothing > 1 && index >= rocPeriod + smoothing) {
    const rocEmas = getSmoothedRocArray(series, rocPeriod, smoothing);
    if (!isNaN(rocEmas[index]))     smoothedRoc     = rocEmas[index];
    if (!isNaN(rocEmas[index - 1])) smoothedPrevRoc = rocEmas[index - 1];
  }

  // Crossover above entry threshold → buy
  if (smoothedPrevRoc < entryThreshold && smoothedRoc >= entryThreshold) {
    return { action: 'buy', reason: `ROC momentum ${smoothedRoc.toFixed(2)}% crossed above entry ${entryThreshold}%` };
  }

  // Cross below exit threshold → sell
  if (smoothedPrevRoc > exitThreshold && smoothedRoc <= exitThreshold) {
    return { action: 'sell', reason: `ROC momentum ${smoothedRoc.toFixed(2)}% crossed below exit ${exitThreshold}%` };
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
