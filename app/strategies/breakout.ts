// Breakout Strategy
// Buy when price breaks above the highest high of the lookback period
// Exit using a trailing stop EMA

import { StrategyDefinition, StrategyHandler, StrategyParameter } from './types';

// Default parameter values
const DEFAULT_LOOKBACK_PERIOD = 20;
const DEFAULT_TRAILING_STOP_EMA_PERIOD = 21;

const parameters: StrategyParameter[] = [
  {
    key: 'lookbackPeriod',
    name: 'Lookback Period',
    description: `Number of bars to look back for breakout detection (default: ${DEFAULT_LOOKBACK_PERIOD})`,
    type: 'number',
    default: DEFAULT_LOOKBACK_PERIOD,
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
  {
    key: 'trailingStopEmaPeriod',
    name: 'Trailing Stop EMA Period',
    description: `EMA period for trailing stop exit (default: ${DEFAULT_TRAILING_STOP_EMA_PERIOD}). Set to 0 to use breakdown exit.`,
    type: 'number',
    default: DEFAULT_TRAILING_STOP_EMA_PERIOD,
    min: 0,
    max: 200,
    step: 1,
  },
];

const handler: StrategyHandler = ({ current, index, series, params }) => {
  const lookbackPeriod = (params.lookbackPeriod as number) || DEFAULT_LOOKBACK_PERIOD;
  const useClose = params.useClose as boolean;
  const trailingStopEmaPeriod = (params.trailingStopEmaPeriod as number) ?? DEFAULT_TRAILING_STOP_EMA_PERIOD;

  // Need enough data for lookback period
  if (index < lookbackPeriod) {
    return { action: 'hold', reason: 'Waiting for sufficient data' };
  }

  // Get the lookback range (excluding current bar)
  const lookbackBars = series.slice(index - lookbackPeriod, index);

  // Calculate highest high and lowest low in the lookback period
  // When useClose is true, use close prices for breakout levels
  // When useClose is false, use high/low prices for breakout levels
  const highestHigh = useClose
    ? Math.max(...lookbackBars.map(bar => bar.close))
    : Math.max(...lookbackBars.map(bar => bar.high));

  const lowestLow = useClose
    ? Math.min(...lookbackBars.map(bar => bar.close))
    : Math.min(...lookbackBars.map(bar => bar.low));

  // Use consistent price comparison based on useClose setting
  // When useClose is true, compare close to close-based levels
  // When useClose is false, compare high/low to high/low-based levels
  const priceForBuySignal = useClose ? current.close : current.high;

  // Breakout above the highest high - BUY signal
  if (priceForBuySignal > highestHigh) {
    return {
      action: 'buy',
      reason: `Breakout above ${lookbackPeriod}-period high (${priceForBuySignal.toFixed(2)} > ${highestHigh.toFixed(2)})`,
    };
  }

  // Exit logic: Use trailing stop EMA if configured, otherwise use breakdown
  if (trailingStopEmaPeriod > 0) {
    // Get the trailing stop EMA value
    const emaKey = `ema${trailingStopEmaPeriod}` as keyof typeof current;
    const trailingStopEma = current[emaKey] as number | undefined;

    if (trailingStopEma !== undefined) {
      // Check if the low of the bar hits the trailing stop EMA
      // This allows for intrabar exit at the stop level
      if (current.low <= trailingStopEma) {
        return {
          action: 'sell',
          reason: `Trailing stop EMA ${trailingStopEmaPeriod} hit (low ${current.low.toFixed(2)} <= EMA ${trailingStopEma.toFixed(2)})`,
        };
      }
    }
  } else {
    // Fallback to original breakdown logic
    const priceForSellSignal = useClose ? current.close : current.low;
    if (priceForSellSignal < lowestLow) {
      return {
        action: 'sell',
        reason: `Breakdown below ${lookbackPeriod}-period low (${priceForSellSignal.toFixed(2)} < ${lowestLow.toFixed(2)})`,
      };
    }
  }

  return { action: 'hold', reason: 'Within range' };
};

const strategy: StrategyDefinition = {
  id: 'breakout',
  name: 'Breakout',
  description: 'Buy on breakout above highest high, exit using trailing stop EMA',
  handler,
  parameters,
};

export default strategy;
