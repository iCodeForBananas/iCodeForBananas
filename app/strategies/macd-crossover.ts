// MACD Crossover Strategy
// Buy when MACD line crosses above signal line, sell when it crosses below

import { StrategyDefinition, StrategyHandler, StrategyParameter } from './types';

const parameters: StrategyParameter[] = [
  {
    key: 'fastPeriod',
    name: 'Fast EMA Period',
    description: 'Period for the fast EMA (default: 12)',
    type: 'number',
    default: 12,
    min: 2,
    max: 50,
    step: 1,
  },
  {
    key: 'slowPeriod',
    name: 'Slow EMA Period',
    description: 'Period for the slow EMA (default: 26)',
    type: 'number',
    default: 26,
    min: 5,
    max: 100,
    step: 1,
  },
  {
    key: 'signalPeriod',
    name: 'Signal Period',
    description: 'Period for the signal line (default: 9)',
    type: 'number',
    default: 9,
    min: 2,
    max: 50,
    step: 1,
  },
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
  const fastPeriod = (params.fastPeriod as number) || 12;
  const slowPeriod = (params.slowPeriod as number) || 26;
  const signalPeriod = (params.signalPeriod as number) || 9;
  const histogramThreshold = (params.histogramThreshold as number) || 0;

  // Access dynamic MACD values keyed by periods
  const macdKey = `macd_${fastPeriod}_${slowPeriod}_${signalPeriod}` as keyof typeof current;
  const signalKey = `macdSignal_${fastPeriod}_${slowPeriod}_${signalPeriod}` as keyof typeof current;
  const histogramKey = `macdHistogram_${fastPeriod}_${slowPeriod}_${signalPeriod}` as keyof typeof current;

  const currentMacd = current[macdKey] as number | undefined;
  const currentSignal = current[signalKey] as number | undefined;
  const currentHistogram = current[histogramKey] as number | undefined;
  const previousMacd = previous?.[macdKey] as number | undefined;
  const previousSignal = previous?.[signalKey] as number | undefined;

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
        reason: `MACD(${fastPeriod},${slowPeriod},${signalPeriod}) crossed above signal (histogram: ${currentHistogram.toFixed(2)})`,
      };
    }
  }

  // Bearish crossover: MACD line crosses below signal line
  // Histogram should be negative and below negative threshold for bearish confirmation
  if (previousMacd >= previousSignal && currentMacd < currentSignal) {
    if (currentHistogram <= -histogramThreshold) {
      return {
        action: 'sell',
        reason: `MACD(${fastPeriod},${slowPeriod},${signalPeriod}) crossed below signal (histogram: ${currentHistogram.toFixed(2)})`,
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
