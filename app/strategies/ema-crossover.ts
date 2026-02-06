// EMA Crossover Strategy
// Buy when EMA 9 crosses above EMA 21, sell when it crosses below

import { StrategyDefinition, StrategyHandler } from './types';

const handler: StrategyHandler = ({ current, previous }) => {
  if (!current.ema9 || !current.ema21 || !previous?.ema9 || !previous?.ema21) {
    return { action: 'hold', reason: 'Waiting for indicators' };
  }

  // Bullish crossover
  if (previous.ema9 <= previous.ema21 && current.ema9 > current.ema21) {
    return { action: 'buy', reason: 'EMA 9 crossed above EMA 21' };
  }

  // Bearish crossover
  if (previous.ema9 >= previous.ema21 && current.ema9 < current.ema21) {
    return { action: 'sell', reason: 'EMA 9 crossed below EMA 21' };
  }

  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'ema-crossover',
  name: 'EMA Crossover',
  description: 'Buy when EMA 9 crosses above EMA 21, sell when it crosses below',
  handler,
};

export default strategy;
