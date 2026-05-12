// Breakout Strategy
// Long: Buy when CLOSE breaks above the highest close of the lookback period
// Short: Sell when CLOSE breaks below the lowest close of the lookback period
// Exit on opposite-direction breakout (engine optionally tightens the exit
// price to the trailing-stop EMA if crossed during that bar).
//
// Close-based by design: signal price equals fill price (fills execute at the
// bar close in both the backtester and the lambda executor), so the strategy
// only ever trades on confirmed candle closes — intrabar wicks do not trigger.

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
    key: 'trailingStopEmaPeriod',
    name: 'Trailing Stop EMA Period',
    description: `EMA period for trailing stop exit (default: ${DEFAULT_TRAILING_STOP_EMA_PERIOD}). Set to 0 to use opposite breakout exit.`,
    type: 'number',
    default: DEFAULT_TRAILING_STOP_EMA_PERIOD,
    min: 0,
    max: 200,
    step: 1,
  },
];

const handler: StrategyHandler = ({ current, index, series, params }) => {
  const lookbackPeriod = (params.lookbackPeriod as number) || DEFAULT_LOOKBACK_PERIOD;
  // trailingStopEmaPeriod is consumed by the engine (not the handler) — it
  // reads `params.trailingStopEmaPeriod` directly to apply a trailing stop on
  // bar exits. Keep it as a declared parameter so the UI can configure it.

  // Need enough data for lookback period
  if (index < lookbackPeriod) {
    return { action: 'hold', reason: 'Waiting for sufficient data' };
  }

  // Inline scan over [index - lookbackPeriod, index) — avoids slice/map allocations
  // on every bar (matters when this runs ~5M times during a wide param sweep).
  let highestClose = -Infinity;
  let lowestClose = Infinity;
  const start = index - lookbackPeriod;
  for (let j = start; j < index; j++) {
    const c = series[j].close;
    if (c > highestClose) highestClose = c;
    if (c < lowestClose) lowestClose = c;
  }

  const priceForBuySignal = current.close;
  const priceForSellSignal = current.close;
  const highestHigh = highestClose;
  const lowestLow = lowestClose;

  // Breakout above the highest close - BUY signal (long entry / short exit)
  if (priceForBuySignal > highestHigh) {
    return {
      action: 'buy',
      reason: `Breakout above ${lookbackPeriod}-period high (${priceForBuySignal.toFixed(2)} > ${highestHigh.toFixed(2)})`,
    };
  }

  // Breakdown below the lowest low - SELL signal (short entry / long exit)
  if (priceForSellSignal < lowestLow) {
    return {
      action: 'sell',
      reason: `Breakdown below ${lookbackPeriod}-period low (${priceForSellSignal.toFixed(2)} < ${lowestLow.toFixed(2)})`,
    };
  }

  // NOTE on exits: prior versions of this handler returned buy/sell here on
  // EMA crossover events to act as a trailing-stop "close". That was wrong —
  // the strategy handler has no position context, so the engine treated those
  // signals as fresh entries when flat (it opened longs after EMA crossovers
  // even though no breakout had occurred). The engine has built-in trailing-
  // stop-EMA support that runs only when an opposite-direction breakout fires
  // while a position is open (see backtest-engine.ts), so the right behavior
  // here is simply to hold until the next genuine breakout.

  return { action: 'hold', reason: 'Within range' };
};

const strategy: StrategyDefinition = {
  id: 'breakout',
  name: 'Breakout',
  description: 'Buy on breakout above highest high, sell on breakdown below lowest low, with trailing stop EMA exits',
  handler,
  parameters,
};

export default strategy;
