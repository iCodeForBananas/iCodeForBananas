// Donchian Channel Breakout Strategy
// Buy when price breaks above upper channel, sell when price breaks below lower channel
// Note: The backtest system calculates Donchian Channels with a fixed 20-period for upper/lower bands

import { StrategyDefinition, StrategyHandler, StrategyParameter } from './types';

const DEFAULT_MIDLINE_PERIOD = 20;

const parameters: StrategyParameter[] = [
  {
    key: 'midlinePeriod',
    name: 'Midline Period',
    description: 'Period for midline calculation (independent from upper/lower bands)',
    type: 'number',
    default: DEFAULT_MIDLINE_PERIOD,
    min: 5,
    max: 100,
    step: 5,
  },
  {
    key: 'useMidlineExit',
    name: 'Exit at Midline',
    description: 'Exit position when price crosses the midline instead of opposite band',
    type: 'boolean',
    default: false,
  },
];

// Calculate custom midline with a specific period
function calculateMidline(
  series: { high: number; low: number }[],
  index: number,
  period: number
): number | undefined {
  if (index < period - 1) return undefined;
  const slice = series.slice(index - period + 1, index + 1);
  const highest = Math.max(...slice.map((d) => d.high));
  const lowest = Math.min(...slice.map((d) => d.low));
  return (highest + lowest) / 2;
}

const handler: StrategyHandler = ({ current, previous, index, series, params }) => {
  const useMidlineExit = params.useMidlineExit as boolean;
  const midlinePeriod = (params.midlinePeriod as number) || DEFAULT_MIDLINE_PERIOD;

  // The backtest system pre-calculates Donchian Channels with a fixed 20-period
  // These are available as upperBand, lowerBand
  // We compare current price to PREVIOUS bar's bands for breakout detection
  // (since current bar's bands include current bar's high/low)
  const prevUpperBand = previous?.upperBand;
  const prevLowerBand = previous?.lowerBand;

  if (!previous || prevUpperBand === undefined || prevLowerBand === undefined) {
    return { action: 'hold', reason: 'Waiting for Donchian Channel' };
  }

  // Calculate custom midline with the configured period for previous bar
  const prevMidLine = index > 0 ? calculateMidline(series, index - 1, midlinePeriod) : undefined;

  // Validate midline is available when using midline exit
  if (useMidlineExit && prevMidLine === undefined) {
    return { action: 'hold', reason: 'Waiting for midline calculation' };
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
    // Exit at midline crossing (prevMidLine is guaranteed defined here)
    if (current.close < prevMidLine!) {
      return {
        action: 'sell',
        reason: `Price crossed below midline (${current.close.toFixed(2)} < ${prevMidLine!.toFixed(2)})`,
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
