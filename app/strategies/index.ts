// Strategy Registry
// Export all available strategies for the algo-backtest feature

import { StrategyDefinition, StrategyParameter } from './types';
import alligator from './alligator';
import bollingerBands from './bollinger-bands';
import breakout from './breakout';
import emaCrossover from './ema-crossover';
import emaPriceCross from './ema-price-cross';
import emaPullback from './ema-pullback';
import macdCrossover from './macd-crossover';
import rsiMeanReversion from './rsi-mean-reversion';
import smaCrossover from './sma-crossover';
import donchianChannel from './donchian-channel';
import rsi2 from './rsi2';
import tripleEma from './triple-ema';
import keltnerChannel from './keltner-channel';
import momentumRoc from './momentum-roc';
import stochastic from './stochastic';
import ibsMeanReversion from './ibs-mean-reversion';
import ibsTrend from './ibs-trend';
import double7s from './double-7s';
import cumulativeRsi from './cumulative-rsi';
import turtle from './turtle';
import faberTrend from './faber-trend';
import timeSeriesMomentum from './time-series-momentum';
import kamaTrend from './kama-trend';
import ichimoku from './ichimoku';
import connorsRsi from './connors-rsi';
import turnOfMonth from './turn-of-month';
import supplyDemand from './supply-demand';
import adxDmi from './adx-dmi';
import regressionMomentum from './regression-momentum';
import connorsR3 from './connors-r3';
import connorsPercentB from './connors-percent-b';

export const AVAILABLE_STRATEGIES: Record<string, StrategyDefinition> = {
  // Trend Following
  'alligator': alligator,
  'ema-crossover': emaCrossover,
  'triple-ema': tripleEma,
  'sma-crossover': smaCrossover,
  'ema-price-cross': emaPriceCross,
  'ema-pullback': emaPullback,
  'macd-crossover': macdCrossover,
  'donchian-channel': donchianChannel,
  'breakout': breakout,
  'turtle': turtle,
  'momentum-roc': momentumRoc,
  'faber-trend': faberTrend,
  'time-series-momentum': timeSeriesMomentum,
  'kama-trend': kamaTrend,
  'ichimoku': ichimoku,
  'adx-dmi': adxDmi,
  'regression-momentum': regressionMomentum,
  // Mean Reversion
  'bollinger-bands': bollingerBands,
  'keltner-channel': keltnerChannel,
  'rsi-mean-reversion': rsiMeanReversion,
  'rsi2': rsi2,
  'stochastic': stochastic,
  'cumulative-rsi': cumulativeRsi,
  'double-7s': double7s,
  'ibs-mean-reversion': ibsMeanReversion,
  'ibs-trend': ibsTrend,
  'connors-rsi': connorsRsi,
  'connors-r3': connorsR3,
  'connors-percent-b': connorsPercentB,
  // Support & Resistance
  'supply-demand': supplyDemand,
  // Calendar
  'turn-of-month': turnOfMonth,
};

export * from './types';

// Helper to get default parameter values for a strategy
/** A number parameter whose default, range and step are all whole numbers: a period, a length, a count. */
export function isWholeNumberParameter(p: StrategyParameter): boolean {
  return p.type === 'number' && [p.default, p.min, p.max, p.step].every((v) => v === undefined || Number.isInteger(Number(v)));
}

/**
 * The step a sweep starts with: 1 for a whole-number parameter, so a sweep
 * can land on any period; a decimal parameter's own step (0.5 standard
 * deviations, 0.05% of price), which suits its range.
 */
export function defaultSweepStep(p: StrategyParameter): number {
  return isWholeNumberParameter(p) ? 1 : (p.step ?? 0.1);
}

/** A parameter's default sweep: its whole range, by its default step. */
export function defaultVariation(p: StrategyParameter): { key: string; min: number; max: number; step: number } {
  return { key: p.key, min: p.min ?? Number(p.default), max: p.max ?? Number(p.default), step: defaultSweepStep(p) };
}

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
