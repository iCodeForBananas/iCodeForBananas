// EMA Crossover Strategy
// Buy when fast EMA crosses above slow EMA, sell when it crosses below

import { StrategyDefinition, StrategyHandler, StrategyParameter } from './types';

const parameters: StrategyParameter[] = [
  {
    key: 'fastPeriod',
    name: 'Fast EMA Period',
    description: 'Period for the fast EMA (default: 9)',
    type: 'number',
    default: 9,
    min: 2,
    max: 50,
    step: 1,
  },
  {
    key: 'slowPeriod',
    name: 'Slow EMA Period',
    description: 'Period for the slow EMA (default: 21)',
    type: 'number',
    default: 21,
    min: 5,
    max: 200,
    step: 1,
  },
];

const handler: StrategyHandler = ({ current, previous, params }) => {
  const fastPeriod = (params.fastPeriod as number) || 9;
  const slowPeriod = (params.slowPeriod as number) || 21;
  
  const fastKey = `ema${fastPeriod}` as keyof typeof current;
  const slowKey = `ema${slowPeriod}` as keyof typeof current;
  
  const currentFast = current[fastKey] as number | undefined;
  const currentSlow = current[slowKey] as number | undefined;
  const previousFast = previous?.[fastKey] as number | undefined;
  const previousSlow = previous?.[slowKey] as number | undefined;
  
  if (!currentFast || !currentSlow || !previousFast || !previousSlow) {
    return { action: 'hold', reason: 'Waiting for indicators' };
  }

  // Bullish crossover
  if (previousFast <= previousSlow && currentFast > currentSlow) {
    return { action: 'buy', reason: `EMA ${fastPeriod} crossed above EMA ${slowPeriod}` };
  }

  // Bearish crossover
  if (previousFast >= previousSlow && currentFast < currentSlow) {
    return { action: 'sell', reason: `EMA ${fastPeriod} crossed below EMA ${slowPeriod}` };
  }

  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'ema-crossover',
  name: 'EMA Crossover',
  description: 'Buy when fast EMA crosses above slow EMA, sell when it crosses below',
  handler,
  parameters,
};

export default strategy;
