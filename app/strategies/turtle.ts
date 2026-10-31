// Turtle Trading (Richard Dennis & William Eckhardt)
// Enter on a close beyond the prior N-bar high/low (System 1: 20, System 2: 55),
// exit on a close beyond the shorter opposite channel (System 1: 10, System 2: 20).
// Unlike the Donchian strategy here, the exit channel is its own period rather
// than a midline, so winners get room to run.

import { StrategyDefinition, StrategyHandler, StrategyParameter } from './types';

const parameters: StrategyParameter[] = [
  {
    key: 'entryPeriod',
    name: 'Entry Channel',
    description: 'Breakout lookback in bars (System 1: 20, System 2: 55)',
    type: 'number',
    default: 20,
    min: 10,
    max: 100,
    step: 5,
  },
  {
    key: 'exitPeriod',
    name: 'Exit Channel',
    description: 'Opposite-side lookback for exits (System 1: 10, System 2: 20)',
    type: 'number',
    default: 10,
    min: 5,
    max: 50,
    step: 5,
  },
];

/** Highest high and lowest low of the `period` bars before `index`. */
export function priorChannel(
  series: { high: number; low: number }[],
  index: number,
  period: number,
): { high: number; low: number } | null {
  if (index < period) return null;
  let high = -Infinity;
  let low = Infinity;
  for (let i = index - period; i < index; i++) {
    high = Math.max(high, series[i].high);
    low = Math.min(low, series[i].low);
  }
  return { high, low };
}

const handler: StrategyHandler = ({ current, series, index, params, position }) => {
  const entryPeriod = (params.entryPeriod as number) || 20;
  const exitPeriod = (params.exitPeriod as number) || 10;

  const entry = priorChannel(series, index, entryPeriod);
  const exit = priorChannel(series, index, exitPeriod);
  if (!entry || !exit) return { action: 'hold', reason: 'Warming up' };

  if (position === 'long' && current.close < exit.low) {
    return { action: 'sell', reason: `Closed below ${exitPeriod}-bar low (${exit.low.toFixed(2)})` };
  }
  if (position === 'short' && current.close > exit.high) {
    return { action: 'buy', reason: `Closed above ${exitPeriod}-bar high (${exit.high.toFixed(2)})` };
  }
  if (position) return { action: 'hold', reason: '' };

  if (current.close > entry.high) {
    return { action: 'buy', reason: `${entryPeriod}-bar breakout (${current.close.toFixed(2)} > ${entry.high.toFixed(2)})` };
  }
  // Opens a short only when shorts are enabled; flat otherwise.
  if (current.close < entry.low) {
    return { action: 'sell', reason: `${entryPeriod}-bar breakdown (${current.close.toFixed(2)} < ${entry.low.toFixed(2)})` };
  }

  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'turtle',
  name: 'Turtle Breakout',
  description: 'Enter on a 20-bar (or 55-bar) channel breakout, exit on a 10-bar (or 20-bar) opposite breakout. The classic Turtle rules.',
  handler,
  parameters,
};

export default strategy;
