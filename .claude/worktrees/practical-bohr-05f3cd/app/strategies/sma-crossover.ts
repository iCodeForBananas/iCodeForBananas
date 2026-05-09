// SMA Crossover Strategy (Golden Cross / Death Cross)
// Buy when fast SMA crosses above slow SMA, sell when it crosses below

import { StrategyDefinition, StrategyHandler, StrategyParameter } from './types';

const parameters: StrategyParameter[] = [
  {
    key: 'fastPeriod',
    name: 'Fast SMA Period',
    description: 'Period for the fast SMA (default: 50)',
    type: 'number',
    default: 50,
    min: 5,
    max: 100,
    step: 5,
  },
  {
    key: 'slowPeriod',
    name: 'Slow SMA Period',
    description: 'Period for the slow SMA (default: 200)',
    type: 'number',
    default: 200,
    min: 50,
    max: 500,
    step: 10,
  },
];

const handler: StrategyHandler = ({ current, previous, params }) => {
  const fastPeriod = (params.fastPeriod as number) || 50;
  const slowPeriod = (params.slowPeriod as number) || 200;
  
  const fastKey = `sma${fastPeriod}` as keyof typeof current;
  const slowKey = `sma${slowPeriod}` as keyof typeof current;
  
  const currentFast = current[fastKey] as number | undefined;
  const currentSlow = current[slowKey] as number | undefined;
  const previousFast = previous?.[fastKey] as number | undefined;
  const previousSlow = previous?.[slowKey] as number | undefined;

  if (!currentFast || !currentSlow || !previousFast || !previousSlow) {
    return { action: 'hold', reason: 'Waiting for SMAs' };
  }

  // Golden Cross: fast SMA crosses above slow SMA
  if (previousFast <= previousSlow && currentFast > currentSlow) {
    return { action: 'buy', reason: `Golden Cross - SMA ${fastPeriod} crossed above SMA ${slowPeriod}` };
  }

  // Death Cross: fast SMA crosses below slow SMA
  if (previousFast >= previousSlow && currentFast < currentSlow) {
    return { action: 'sell', reason: `Death Cross - SMA ${fastPeriod} crossed below SMA ${slowPeriod}` };
  }

  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'sma-crossover',
  name: 'Golden Cross/Death Cross',
  description: 'Buy when fast SMA crosses above slow SMA, sell on death cross',
  handler,
  parameters,
};

export default strategy;
