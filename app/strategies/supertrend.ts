// Supertrend Strategy
// ATR-based trend following indicator. One of the most widely used trend-following tools.
// Buy when price closes above the Supertrend line; sell when it closes below.

import { StrategyDefinition, StrategyHandler, StrategyParameter } from './types';

const parameters: StrategyParameter[] = [
  {
    key: 'atrPeriod',
    name: 'ATR Period',
    description: 'Period for ATR calculation (default: 10)',
    type: 'number',
    default: 10,
    min: 5,
    max: 30,
    step: 1,
  },
  {
    key: 'multiplier',
    name: 'ATR Multiplier',
    description: 'Multiplier applied to ATR for band width (default: 3.0)',
    type: 'number',
    default: 3.0,
    min: 1.0,
    max: 6.0,
    step: 0.5,
  },
];

// Supertrend requires stateful computation across bars — we maintain it on the series
const handler: StrategyHandler = ({ series, index, params }) => {
  const atrPeriod = (params.atrPeriod as number) ?? 10;
  const multiplier = (params.multiplier as number) ?? 3.0;

  if (index < atrPeriod + 1) return { action: 'hold', reason: 'Warming up' };

  // Compute ATR for current bar
  const slice = series.slice(Math.max(0, index - atrPeriod), index + 1);
  let atrSum = 0;
  for (let i = 1; i < slice.length; i++) {
    const tr = Math.max(
      slice[i].high - slice[i].low,
      Math.abs(slice[i].high - slice[i - 1].close),
      Math.abs(slice[i].low - slice[i - 1].close)
    );
    atrSum += tr;
  }
  const atr = atrSum / Math.min(atrPeriod, slice.length - 1);

  const current = series[index];
  const prev = series[index - 1];

  const hl2 = (current.high + current.low) / 2;
  const upperBasic = hl2 + multiplier * atr;
  const lowerBasic = hl2 - multiplier * atr;

  // Simple Supertrend: if close > upper band → uptrend (buy), if close < lower band → downtrend (sell)
  // We use a 2-bar lookback to detect crossovers

  const prevHl2 = (prev.high + prev.low) / 2;

  // Compute ATR for previous bar
  const prevSlice = series.slice(Math.max(0, index - atrPeriod - 1), index);
  let prevAtrSum = 0;
  for (let i = 1; i < prevSlice.length; i++) {
    const tr = Math.max(
      prevSlice[i].high - prevSlice[i].low,
      Math.abs(prevSlice[i].high - (prevSlice[i - 1]?.close ?? prevSlice[i].close)),
      Math.abs(prevSlice[i].low - (prevSlice[i - 1]?.close ?? prevSlice[i].close))
    );
    prevAtrSum += tr;
  }
  const prevAtr = prevAtrSum / Math.max(1, prevSlice.length - 1);
  const prevUpperBasic = prevHl2 + multiplier * prevAtr;
  const prevLowerBasic = prevHl2 - multiplier * prevAtr;

  // Trend direction based on close vs bands
  const currentTrend = current.close > upperBasic ? 1 : current.close < lowerBasic ? -1 : 0;
  const prevTrend = prev.close > prevUpperBasic ? 1 : prev.close < prevLowerBasic ? -1 : 0;

  if (prevTrend <= 0 && currentTrend === 1) {
    return { action: 'buy', reason: `Supertrend bullish (close ${current.close.toFixed(2)} > upper ${upperBasic.toFixed(2)})` };
  }

  if (prevTrend >= 0 && currentTrend === -1) {
    return { action: 'sell', reason: `Supertrend bearish (close ${current.close.toFixed(2)} < lower ${lowerBasic.toFixed(2)})` };
  }

  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'supertrend',
  name: 'Supertrend',
  description: 'ATR-based trend following. Buy when price breaks above the Supertrend band, sell when it breaks below.',
  handler,
  parameters,
};

export default strategy;
