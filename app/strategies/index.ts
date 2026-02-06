// Strategy Registry
// Export all available strategies for the algo-backtest feature

import { StrategyDefinition } from './types';
import emaCrossover from './ema-crossover';
import rsiMeanReversion from './rsi-mean-reversion';
import smaCrossover from './sma-crossover';

export const AVAILABLE_STRATEGIES: Record<string, StrategyDefinition> = {
  'ema-crossover': emaCrossover,
  'rsi-mean-reversion': rsiMeanReversion,
  'sma-crossover': smaCrossover,
};

export * from './types';
