// MACD Crossover Strategy
// Buy when MACD line crosses above signal line, sell when it crosses below

import { StrategyDefinition, StrategyHandler, StrategyParameter } from './types';

const parameters: StrategyParameter[] = [
  {
    key: 'histogramThreshold',
    name: 'Histogram Threshold',
    description: 'Minimum histogram value for signal confirmation (default: 0)',
    type: 'number',
    default: 0,
    min: 0,
    max: 2,
    step: 0.1,
  },
];

const handler: StrategyHandler = ({ current, previous, params }) => {
  const histogramThreshold = (params.histogramThreshold as number) || 0;

  const currentMacd = current.macd;
  const currentSignal = current.macdSignal;
  const currentHistogram = current.macdHistogram;
  const previousMacd = previous?.macd;
  const previousSignal = previous?.macdSignal;

  if (
    currentMacd === undefined ||
    currentSignal === undefined ||
    currentHistogram === undefined ||
    previousMacd === undefined ||
    previousSignal === undefined
  ) {
    return { action: 'hold', reason: 'Waiting for MACD indicators' };
  }

  // Bullish crossover: MACD line crosses above signal line
  // Histogram should be positive and above threshold for bullish confirmation
  if (previousMacd <= previousSignal && currentMacd > currentSignal) {
    if (currentHistogram >= histogramThreshold) {
      return {
        action: 'buy',
        reason: `MACD crossed above signal (histogram: ${currentHistogram.toFixed(2)})`,
      };
    }
  }

  // Bearish crossover: MACD line crosses below signal line
  // Histogram should be negative and below negative threshold for bearish confirmation
  if (previousMacd >= previousSignal && currentMacd < currentSignal) {
    if (currentHistogram <= -histogramThreshold) {
      return {
        action: 'sell',
        reason: `MACD crossed below signal (histogram: ${currentHistogram.toFixed(2)})`,
      };
    }
  }

  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'macd-crossover',
  name: 'MACD Crossover',
  description:
    'Buy when MACD line crosses above signal line, sell when it crosses below',
  handler,
  parameters,
};

export default strategy;
