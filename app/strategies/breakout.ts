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
    step: 1,
  },
  {
    key: 'trailingStopEmaPeriod',
    name: 'Trailing Stop EMA Period',
    description: `EMA period for per-bar trailing stop exit (default: ${DEFAULT_TRAILING_STOP_EMA_PERIOD}). Set to 0 to disable; exits will then only fire on opposite-direction breakouts.`,
    type: 'number',
    default: DEFAULT_TRAILING_STOP_EMA_PERIOD,
    step: 1,
  },
];

const handler: StrategyHandler = ({ current, index, series, params }) => {
  const lookbackPeriod = (params.lookbackPeriod as number) ?? DEFAULT_LOOKBACK_PERIOD;
  // trailingStopEmaPeriod is consumed by the engine (not the handler) — it
  // reads `params.trailingStopEmaPeriod` directly to run a per-bar trailing
  // EMA stop. Keep it as a declared parameter so the UI can configure it.

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

  const price = current.close;

  // Breakout above the highest close - BUY signal (long entry / short exit)
  if (price > highestClose) {
    return {
      action: 'buy',
      reason: `Breakout above ${lookbackPeriod}-period highest close (${price.toFixed(2)} > ${highestClose.toFixed(2)})`,
    };
  }

  // Breakdown below the lowest close - SELL signal (short entry / long exit)
  if (price < lowestClose) {
    return {
      action: 'sell',
      reason: `Breakdown below ${lookbackPeriod}-period lowest close (${price.toFixed(2)} < ${lowestClose.toFixed(2)})`,
    };
  }

  // Exits via opposite-direction breakouts above OR via the engine's per-bar
  // trailing-stop EMA (params.trailingStopEmaPeriod, runs in backtest-engine.ts).
  // Earlier versions of this handler returned buy/sell on EMA crossovers
  // directly — that was wrong because the handler has no position context
  // and the engine treated such signals as fresh entries when flat.

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
