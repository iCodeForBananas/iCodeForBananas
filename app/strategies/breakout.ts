// Breakout Strategy
// Buy when price breaks above the highest high of the lookback period
// Sell when price breaks below the lowest low of the lookback period

import { StrategyDefinition, StrategyHandler, StrategyParameter } from './types';

const parameters: StrategyParameter[] = [
  {
    key: 'lookbackPeriod',
    name: 'Lookback Period',
    description: 'Number of bars to look back for breakout detection (default: 20)',
    type: 'number',
    default: 20,
    min: 5,
    max: 100,
    step: 1,
  },
  {
    key: 'useClose',
    name: 'Use Close Price',
    description: 'Use close price instead of high/low for breakout detection',
    type: 'boolean',
    default: false,
  },
];

const handler: StrategyHandler = ({ current, index, series, params }) => {
  const lookbackPeriod = (params.lookbackPeriod as number) || 20;
  const useClose = params.useClose as boolean;

  // Need enough data for lookback period
  if (index < lookbackPeriod) {
    return { action: 'hold', reason: 'Waiting for sufficient data' };
  }

  // Get the lookback range (excluding current bar)
  const lookbackBars = series.slice(index - lookbackPeriod, index);

  // Calculate highest high and lowest low in the lookback period
  const highestHigh = useClose
    ? Math.max(...lookbackBars.map(bar => bar.close))
    : Math.max(...lookbackBars.map(bar => bar.high));

  const lowestLow = useClose
    ? Math.min(...lookbackBars.map(bar => bar.close))
    : Math.min(...lookbackBars.map(bar => bar.low));

  const currentPrice = current.close;

  // Breakout above the highest high - BUY signal
  if (currentPrice > highestHigh) {
    return {
      action: 'buy',
      reason: `Breakout above ${lookbackPeriod}-period high (${currentPrice.toFixed(2)} > ${highestHigh.toFixed(2)})`,
    };
  }

  // Breakdown below the lowest low - SELL signal
  if (currentPrice < lowestLow) {
    return {
      action: 'sell',
      reason: `Breakdown below ${lookbackPeriod}-period low (${currentPrice.toFixed(2)} < ${lowestLow.toFixed(2)})`,
    };
  }

  return { action: 'hold', reason: 'Within range' };
};

const strategy: StrategyDefinition = {
  id: 'breakout',
  name: 'Breakout',
  description: 'Buy on breakout above highest high, sell on breakdown below lowest low',
  handler,
  parameters,
};

export default strategy;
