// R3 (Larry Connors & Cesar Alvarez, "High Probability ETF Trading", 2009)
// A pullback buy on the 2-period RSI that waits for the selling to persist:
// above the 200-day SMA, RSI(2) falls three days in a row, the first of those
// days starting under 60, and ends under 10. Exit when RSI(2) closes above
// 70. Connors and Alvarez report win rates around 80% on major ETFs from 1993
// to 2008. Shorts mirror it below the 200 SMA.

import { StrategyDefinition, StrategyHandler, StrategyParameter } from './types';
import { getRsiArray } from './cumulative-rsi';

const parameters: StrategyParameter[] = [
  {
    key: 'entryLevel',
    name: 'Entry RSI(2)',
    description: 'Buy when the third falling RSI(2) reading is under this (Connors: 10)',
    type: 'number',
    default: 10,
    min: 2,
    max: 30,
    step: 1,
  },
  {
    key: 'startLevel',
    name: 'Start RSI(2)',
    description: 'The three-day drop must start from under this level (Connors: 60)',
    type: 'number',
    default: 60,
    min: 40,
    max: 100,
    step: 5,
  },
  {
    key: 'exitLevel',
    name: 'Exit RSI(2)',
    description: 'Sell when RSI(2) closes above this (Connors: 70)',
    type: 'number',
    default: 70,
    min: 50,
    max: 95,
    step: 5,
  },
  {
    key: 'trendFilter',
    name: 'Trend Filter (200 SMA)',
    description: 'Only buy above the 200 SMA, and only short below it',
    type: 'boolean',
    default: true,
  },
];

const handler: StrategyHandler = ({ current, series, index, params, position }) => {
  const entry = (params.entryLevel as number) ?? 10;
  const start = (params.startLevel as number) ?? 60;
  const exit = (params.exitLevel as number) ?? 70;
  const trendFilter = (params.trendFilter as boolean) ?? true;
  if (index < 3) return { action: 'hold', reason: 'Warming up' };
  const rsi = getRsiArray(series, 2);
  const r0 = rsi[index - 3], r1 = rsi[index - 2], r2 = rsi[index - 1], r3 = rsi[index];
  if ([r0, r1, r2, r3].some(Number.isNaN)) return { action: 'hold', reason: 'Warming up' };

  if (position === 'long') {
    return r3 > exit ? { action: 'sell', reason: `RSI(2) ${r3.toFixed(1)} > ${exit}` } : { action: 'hold', reason: '' };
  }
  if (position === 'short') {
    return r3 < 100 - exit ? { action: 'buy', reason: `RSI(2) ${r3.toFixed(1)} < ${100 - exit}` } : { action: 'hold', reason: '' };
  }

  const sma = current.sma200;
  const up = !trendFilter || (sma != null && current.close > sma);
  const down = !trendFilter || (sma != null && current.close < sma);
  if (up && r0 < start && r1 < r0 && r2 < r1 && r3 < r2 && r3 < entry) {
    return { action: 'buy', reason: `RSI(2) fell 3 days from ${r0.toFixed(0)} to ${r3.toFixed(1)}` };
  }
  if (down && r0 > 100 - start && r1 > r0 && r2 > r1 && r3 > r2 && r3 > 100 - entry) {
    return { action: 'sell', reason: `RSI(2) rose 3 days from ${r0.toFixed(0)} to ${r3.toFixed(1)}` };
  }
  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'connors-r3',
  name: 'R3 (Connors)',
  description: 'Above the 200 SMA, buy when RSI(2) has fallen three days in a row from under 60 to under 10; sell when it closes above 70. Shorts mirror it.',
  handler,
  parameters,
};

export default strategy;
