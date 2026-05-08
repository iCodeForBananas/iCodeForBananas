// Stochastic Oscillator Strategy
// George Lane's classic momentum indicator comparing close to high-low range.
// %K = (Close - Lowest Low) / (Highest High - Lowest Low) * 100
// %D = SMA of %K (signal line)
// Buy: %K crosses above %D in oversold zone; Sell: %K crosses below %D in overbought zone.

import { StrategyDefinition, StrategyHandler, StrategyParameter } from './types';

const parameters: StrategyParameter[] = [
  {
    key: 'kPeriod',
    name: '%K Period',
    description: 'Lookback period for %K (default: 14)',
    type: 'number',
    default: 14,
    min: 5,
    max: 30,
    step: 1,
  },
  {
    key: 'dPeriod',
    name: '%D Smoothing',
    description: 'SMA period for %D signal line (default: 3)',
    type: 'number',
    default: 3,
    min: 1,
    max: 10,
    step: 1,
  },
  {
    key: 'oversold',
    name: 'Oversold Level',
    description: 'Stochastic level considered oversold (default: 20)',
    type: 'number',
    default: 20,
    min: 5,
    max: 40,
    step: 5,
  },
  {
    key: 'overbought',
    name: 'Overbought Level',
    description: 'Stochastic level considered overbought (default: 80)',
    type: 'number',
    default: 80,
    min: 60,
    max: 95,
    step: 5,
  },
];

function calcStoch(series: { high: number; low: number; close: number }[], index: number, kPeriod: number, dPeriod: number) {
  if (index < kPeriod + dPeriod - 1) return null;

  // Calculate %K values for the last dPeriod bars
  const kValues: number[] = [];
  for (let i = index - dPeriod + 1; i <= index; i++) {
    const slice = series.slice(Math.max(0, i - kPeriod + 1), i + 1);
    const highestHigh = Math.max(...slice.map((b) => b.high));
    const lowestLow = Math.min(...slice.map((b) => b.low));
    const range = highestHigh - lowestLow;
    kValues.push(range === 0 ? 50 : ((series[i].close - lowestLow) / range) * 100);
  }

  const k = kValues[kValues.length - 1];
  const d = kValues.reduce((a, b) => a + b, 0) / kValues.length;
  return { k, d };
}

const handler: StrategyHandler = ({ series, index, params }) => {
  const kPeriod = (params.kPeriod as number) ?? 14;
  const dPeriod = (params.dPeriod as number) ?? 3;
  const oversold = (params.oversold as number) ?? 20;
  const overbought = (params.overbought as number) ?? 80;

  if (index < kPeriod + dPeriod + 1) return { action: 'hold', reason: 'Warming up' };

  const curr = calcStoch(series, index, kPeriod, dPeriod);
  const prev = calcStoch(series, index - 1, kPeriod, dPeriod);

  if (!curr || !prev) return { action: 'hold', reason: 'Warming up' };

  const { k: currK, d: currD } = curr;
  const { k: prevK, d: prevD } = prev;

  // Bullish crossover in oversold zone
  if (prevK <= prevD && currK > currD && currK < oversold + 20) {
    return { action: 'buy', reason: `Stoch %K (${currK.toFixed(1)}) crossed above %D (${currD.toFixed(1)}) near oversold` };
  }

  // Bearish crossover in overbought zone
  if (prevK >= prevD && currK < currD && currK > overbought - 20) {
    return { action: 'sell', reason: `Stoch %K (${currK.toFixed(1)}) crossed below %D (${currD.toFixed(1)}) near overbought` };
  }

  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'stochastic',
  name: 'Stochastic Oscillator',
  description: "George Lane's %K/%D momentum oscillator. Buy %K cross above %D in oversold zone, sell in overbought zone.",
  handler,
  parameters,
};

export default strategy;
