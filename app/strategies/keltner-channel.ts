// Keltner Channel Mean Reversion Strategy
// ATR-based envelope around an EMA. Price reverting from the outer channels is the signal.
// Unlike Bollinger Bands (std dev), Keltner uses ATR — smoother and less volatile bands.

import { StrategyDefinition, StrategyHandler, StrategyParameter } from './types';

const parameters: StrategyParameter[] = [
  {
    key: 'emaPeriod',
    name: 'EMA Period',
    description: 'Center EMA period (default: 20)',
    type: 'number',
    default: 20,
    min: 5,
    max: 50,
    step: 1,
  },
  {
    key: 'atrPeriod',
    name: 'ATR Period',
    description: 'ATR period for channel width (default: 10)',
    type: 'number',
    default: 10,
    min: 5,
    max: 30,
    step: 1,
  },
  {
    key: 'multiplier',
    name: 'ATR Multiplier',
    description: 'Channel width multiplier (default: 2.0)',
    type: 'number',
    default: 2.0,
    min: 1.0,
    max: 4.0,
    step: 0.5,
  },
];

const handler: StrategyHandler = ({ current, previous, series, index, params }) => {
  const emaPeriod = (params.emaPeriod as number) ?? 20;
  const atrPeriod = (params.atrPeriod as number) ?? 10;
  const multiplier = (params.multiplier as number) ?? 2.0;

  if (index < Math.max(emaPeriod, atrPeriod) + 2) {
    return { action: 'hold', reason: 'Warming up' };
  }

  const emaKey = `ema${emaPeriod}` as keyof typeof current;
  const ema = current[emaKey] as number | undefined;
  const prevEma = previous?.[emaKey] as number | undefined;

  if (!ema || !prevEma || !current.atr) {
    return { action: 'hold', reason: 'Waiting for indicators' };
  }

  // Compute local ATR
  const atrSlice = series.slice(Math.max(0, index - atrPeriod), index + 1);
  let atrSum = 0;
  for (let i = 1; i < atrSlice.length; i++) {
    atrSum += Math.max(
      atrSlice[i].high - atrSlice[i].low,
      Math.abs(atrSlice[i].high - atrSlice[i - 1].close),
      Math.abs(atrSlice[i].low - atrSlice[i - 1].close)
    );
  }
  const atr = atrSum / Math.max(1, atrSlice.length - 1);

  const upperBand = ema + multiplier * atr;
  const lowerBand = ema - multiplier * atr;

  const prevUpper = prevEma + multiplier * atr;
  const prevLower = prevEma - multiplier * atr;

  // Mean reversion: buy when price crosses back above lower band (was below, now above)
  const prevClose = previous?.close ?? current.close;
  if (prevClose < prevLower && current.close > lowerBand) {
    return { action: 'buy', reason: `Price crossed back above lower Keltner band (${lowerBand.toFixed(2)})` };
  }

  // Sell when price crosses back below upper band
  if (prevClose > prevUpper && current.close < upperBand) {
    return { action: 'sell', reason: `Price crossed back below upper Keltner band (${upperBand.toFixed(2)})` };
  }

  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'keltner-channel',
  name: 'Keltner Channel',
  description: 'ATR-based envelope mean reversion. Buy when price reverts from lower band, sell from upper band.',
  handler,
  parameters,
};

export default strategy;
