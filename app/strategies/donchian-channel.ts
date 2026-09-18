// Donchian Channel Breakout Strategy
// Long: Buy when price breaks above upper channel, exit when price crosses below center line
// Short: Sell when price breaks below lower channel, exit when price crosses above center line
// Note: The backtest system calculates Donchian Channels dynamically based on the period parameters

import { StrategyDefinition, StrategyHandler, StrategyParameter } from './types';

const parameters: StrategyParameter[] = [
  {
    key: 'period',
    name: 'Channel Period',
    description: 'Number of bars for the upper/lower Donchian bands (default: 20)',
    type: 'number',
    default: 20,
    min: 5,
    max: 100,
    step: 1,
  },
  {
    key: 'centerLinePeriod',
    name: 'Center Line Period',
    description: 'Number of bars for the center line (default: 10)',
    type: 'number',
    default: 10,
    min: 2,
    max: 100,
    step: 1,
  },
];

const handler: StrategyHandler = ({ current, previous, params }) => {
  const period = (params.period as number) || 20;
  const centerLinePeriod = (params.centerLinePeriod as number) || 10;

  // Access dynamic Donchian values keyed by period for upper/lower bands
  const upperKey = `donchian_${period}_upperBand` as keyof typeof current;
  const lowerKey = `donchian_${period}_lowerBand` as keyof typeof current;
  
  // Access center line with its own period
  const centerKey = `donchian_${centerLinePeriod}_midLine` as keyof typeof current;

  // We compare current price to PREVIOUS bar's bands for breakout detection
  // (since current bar's bands include current bar's high/low)
  const prevUpperBand = previous?.[upperKey] as number | undefined;
  const prevLowerBand = previous?.[lowerKey] as number | undefined;
  const prevCenterLine = previous?.[centerKey] as number | undefined;

  if (!previous || prevUpperBand === undefined || prevLowerBand === undefined) {
    return { action: 'hold', reason: 'Waiting for Donchian Channel' };
  }

  // Breakout above previous upper band - BUY signal (long entry / short exit)
  // Current close exceeds the previous bar's upper channel
  if (current.close > prevUpperBand) {
    return {
      action: 'buy',
      reason: `Breakout above upper band (${current.close.toFixed(2)} > ${prevUpperBand.toFixed(2)})`,
    };
  }

  // Breakdown below previous lower band - SELL signal (short entry / long exit)
  // Current close falls below the previous bar's lower channel
  if (current.close < prevLowerBand) {
    return {
      action: 'sell',
      reason: `Breakdown below lower band (${current.close.toFixed(2)} < ${prevLowerBand.toFixed(2)})`,
    };
  }

  // Exit signals using center line
  if (prevCenterLine !== undefined) {
    // Long exit: price crosses below the center line
    if (current.close < prevCenterLine) {
      return {
        action: 'sell',
        reason: `Price crossed below center line (${current.close.toFixed(2)} < ${prevCenterLine.toFixed(2)})`,
      };
    }

    // Short exit: price crosses above the center line
    if (current.close > prevCenterLine) {
      return {
        action: 'buy',
        reason: `Price crossed above center line (${current.close.toFixed(2)} > ${prevCenterLine.toFixed(2)})`,
      };
    }
  }

  return { action: 'hold', reason: 'Within channel range' };
};

const strategy: StrategyDefinition = {
  id: 'donchian-channel',
  name: 'Donchian Channel Breakout',
  description: 'Buy on breakout above upper channel, sell on breakdown below lower channel, exit at center line',
  handler,
  parameters,
};

export default strategy;
