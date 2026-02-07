// Bollinger Bands Strategy
// Buy when price touches lower band, sell when price touches upper band

import { StrategyDefinition, StrategyHandler, StrategyParameter } from './types';

const parameters: StrategyParameter[] = [
  {
    key: 'period',
    name: 'SMA Period',
    description: 'Period for Bollinger Bands middle line (default: 20)',
    type: 'number',
    default: 20,
    min: 5,
    max: 100,
    step: 1,
  },
  {
    key: 'stdDev',
    name: 'Standard Deviations',
    description: 'Number of standard deviations for bands (default: 2)',
    type: 'number',
    default: 2,
    min: 1,
    max: 4,
    step: 0.5,
  },
];

const handler: StrategyHandler = ({ current, previous, params, series, index }) => {
  const period = (params.period as number) || 20;
  const stdDev = (params.stdDev as number) || 2;

  // Need enough data to calculate Bollinger Bands
  if (index < period - 1) {
    return { action: 'hold', reason: 'Waiting for Bollinger Bands' };
  }

  // Get last 'period' closes
  const closes = series.slice(index - period + 1, index + 1).map(d => d.close);
  
  // Calculate middle band (SMA)
  const sma = closes.reduce((a, b) => a + b, 0) / period;
  
  // Calculate standard deviation
  const variance = closes.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
  const std = Math.sqrt(variance);
  
  // Calculate bands
  const upperBand = sma + (stdDev * std);
  const lowerBand = sma - (stdDev * std);
  
  const currentPrice = current.close;
  const previousPrice = previous?.close;

  if (!previousPrice) {
    return { action: 'hold', reason: 'Waiting for previous price' };
  }

  // Buy signal: price crosses below lower band
  if (previousPrice >= lowerBand && currentPrice < lowerBand) {
    return {
      action: 'buy',
      reason: `Price touched lower Bollinger Band (${currentPrice.toFixed(2)} < ${lowerBand.toFixed(2)})`,
    };
  }

  // Sell signal: price crosses above upper band
  if (previousPrice <= upperBand && currentPrice > upperBand) {
    return {
      action: 'sell',
      reason: `Price touched upper Bollinger Band (${currentPrice.toFixed(2)} > ${upperBand.toFixed(2)})`,
    };
  }

  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'bollinger-bands',
  name: 'Bollinger Bands',
  description: 'Buy when price touches lower band, sell when touches upper band',
  handler,
  parameters,
};

export default strategy;
