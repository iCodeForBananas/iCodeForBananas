// Strategy Registry
// Export all available strategies for the algo-backtest feature

import { StrategyDefinition } from './types';
import bollingerBands from './bollinger-bands';
import breakout from './breakout';
import emaCrossover from './ema-crossover';
import emaPriceCross from './ema-price-cross';
import macdCrossover from './macd-crossover';
import rsiMeanReversion from './rsi-mean-reversion';
import smaCrossover from './sma-crossover';
import donchianChannel from './donchian-channel';
import rsi2 from './rsi2';
import supertrend from './supertrend';
import tripleEma from './triple-ema';
import keltnerChannel from './keltner-channel';
import chandelierExit from './chandelier-exit';
import momentumRoc from './momentum-roc';
import stochastic from './stochastic';

export const AVAILABLE_STRATEGIES: Record<string, StrategyDefinition> = {
  // Trend Following
  'ema-crossover': emaCrossover,
  'triple-ema': tripleEma,
  'sma-crossover': smaCrossover,
  'ema-price-cross': emaPriceCross,
  'macd-crossover': macdCrossover,
  'supertrend': supertrend,
  'chandelier-exit': chandelierExit,
  'donchian-channel': donchianChannel,
  'breakout': breakout,
  'momentum-roc': momentumRoc,
  // Mean Reversion
  'bollinger-bands': bollingerBands,
  'keltner-channel': keltnerChannel,
  'rsi-mean-reversion': rsiMeanReversion,
  'rsi2': rsi2,
  'stochastic': stochastic,
};

export * from './types';

// Helper to get default parameter values for a strategy
export function getDefaultParams(strategyId: string): Record<string, number | boolean | string> {
  const strategy = AVAILABLE_STRATEGIES[strategyId];
  if (!strategy?.parameters) return {};
  
  const defaults: Record<string, number | boolean | string> = {};
  for (const param of strategy.parameters) {
    defaults[param.key] = param.default;
  }
  return defaults;
}

// Generate parameter variations for batch testing
export function generateParameterVariations(
  strategy: StrategyDefinition,
  variations: { key: string; values: (number | boolean | string)[] }[]
): Record<string, number | boolean | string>[] {
  if (variations.length === 0 || !strategy.parameters) {
    return [getDefaultParams(strategy.id)];
  }

  // Start with default values
  const defaults = getDefaultParams(strategy.id);
  
  // Filter to only variations with actual values
  const validVariations = variations.filter((v) => v.values.length > 0);
  
  if (validVariations.length === 0) {
    return [defaults];
  }
  
  // Generate cartesian product of all valid variations
  let result: Record<string, number | boolean | string>[] = [{ ...defaults }];
  
  for (const variation of validVariations) {
    const newResult: Record<string, number | boolean | string>[] = [];
    for (const existing of result) {
      for (const value of variation.values) {
        newResult.push({ ...existing, [variation.key]: value });
      }
    }
    result = newResult;
  }
  
  return result;
}

// Create a human-readable label for a parameter set
export function createParamLabel(params: Record<string, number | boolean | string>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    parts.push(`${key}=${value}`);
  }
  return parts.join(', ');
}
