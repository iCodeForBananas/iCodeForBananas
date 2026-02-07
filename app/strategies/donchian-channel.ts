// Donchian Channel Breakout Strategy
// Buy when price breaks above upper channel, sell when price breaks below lower channel
// Note: The backtest system calculates Donchian Channels dynamically based on the period parameter

import { StrategyDefinition, StrategyHandler, StrategyParameter } from './types';

const parameters: StrategyParameter[] = [
  {
    key: 'period',
    name: 'Channel Period',
    description: 'Number of bars to calculate the Donchian Channel (default: 20)',
    type: 'number',
    default: 20,
    min: 5,
    max: 100,
    step: 1,
  },
  {
    key: 'useMidlineExit',
    name: 'Exit at Midline',
    description: 'Exit position when price crosses the midline instead of opposite band',
    type: 'boolean',
    default: false,
  },
];

const handler: StrategyHandler = ({ current, previous, params }) => {
  const period = (params.period as number) || 20;
  const useMidlineExit = params.useMidlineExit as boolean;

  // Access dynamic Donchian values keyed by period
  const upperKey = `donchian_${period}_upperBand` as keyof typeof current;
  const lowerKey = `donchian_${period}_lowerBand` as keyof typeof current;
  const midKey = `donchian_${period}_midLine` as keyof typeof current;

  // We compare current price to PREVIOUS bar's bands for breakout detection
  // (since current bar's bands include current bar's high/low)
  const prevUpperBand = previous?.[upperKey] as number | undefined;
  const prevLowerBand = previous?.[lowerKey] as number | undefined;
  const prevMidLine = previous?.[midKey] as number | undefined;

  if (!previous || prevUpperBand === undefined || prevLowerBand === undefined) {
    return { action: 'hold', reason: 'Waiting for Donchian Channel' };
  }

  // Breakout above previous upper band - BUY signal
  // Current close exceeds the previous bar's upper channel
  if (current.close > prevUpperBand) {
    return {
      action: 'buy',
      reason: `Breakout above upper band (${current.close.toFixed(2)} > ${prevUpperBand.toFixed(2)})`,
    };
  }

  // Check for sell signals
  if (useMidlineExit) {
    // Exit at midline crossing
    if (prevMidLine !== undefined && current.close < prevMidLine) {
      return {
        action: 'sell',
        reason: `Price crossed below midline (${current.close.toFixed(2)} < ${prevMidLine.toFixed(2)})`,
      };
    }
  } else {
    // Breakdown below previous lower band - SELL signal
    if (current.close < prevLowerBand) {
      return {
        action: 'sell',
        reason: `Breakdown below lower band (${current.close.toFixed(2)} < ${prevLowerBand.toFixed(2)})`,
      };
    }
  }

  return { action: 'hold', reason: 'Within channel range' };
};

const strategy: StrategyDefinition = {
  id: 'donchian-channel',
  name: 'Donchian Channel Breakout',
  description: 'Buy on breakout above upper channel, sell on breakdown below lower channel',
  handler,
  parameters,
};

export default strategy;
