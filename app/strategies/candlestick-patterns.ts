// Candlestick Patterns
// Trades the classic reversal and continuation patterns in candle-patterns.ts:
// engulfing, hammer / shooting star, morning / evening star, piercing line /
// dark cloud cover, harami, three white soldiers / black crows, and inside bar
// breakouts. Buy on a bullish pattern, short on a bearish one when shorts are
// enabled, and hold a fixed number of bars, the way Bulkowski and Marshall et
// al. measured them, or until the opposite pattern.
// On their own, patterns are a weak edge on liquid US stocks. The knobs that
// matter are the ones that put them in context: a prior move for reversals
// (on by default), the 200 SMA trend, and volume above normal on the pattern
// bar. Works on any timeframe; volume confirmation needs bars with volume.

import { StrategyDefinition, StrategyHandler, StrategyParameter, OHLCBar, IndicatorValues } from './types';
import { ALL_PATTERNS, PATTERN_NAMES, PatternId, detectPatterns } from './candle-patterns';
import { relativeVolume } from './volume';

const parameters: StrategyParameter[] = [
  {
    key: 'pattern',
    name: 'Pattern',
    description: 'Which pattern to trade, or all of them',
    type: 'select',
    default: 'all',
    options: ['all', ...ALL_PATTERNS],
  },
  {
    key: 'contextBars',
    name: 'Prior Move (bars)',
    description: 'Reversal patterns need a decline (bullish) or rise (bearish) over this many bars before them; 0 = off',
    type: 'number',
    default: 5,
    min: 0,
    max: 20,
    step: 1,
  },
  {
    key: 'holdBars',
    name: 'Hold (bars)',
    description: 'Exit this many bars after the last pattern in the trade direction',
    type: 'number',
    default: 5,
    min: 1,
    max: 30,
    step: 1,
  },
  {
    key: 'trendFilter',
    name: 'Trend Filter (200 SMA)',
    description: 'Only buy above the 200 SMA, and only short below it',
    type: 'boolean',
    default: false,
  },
  {
    key: 'minRelVolume',
    name: 'Min Relative Volume',
    description: 'Pattern bar volume must be this multiple of the prior 20 bars average; 0 = off',
    type: 'number',
    default: 0,
    min: 0,
    max: 3,
    step: 0.25,
  },
];

type Bar = OHLCBar & IndicatorValues;

interface Settings {
  ids: PatternId[];
  contextBars: number;
  trendFilter: boolean;
  minRelVolume: number;
}

/** +1 for a tradable bullish pattern at `i`, -1 for bearish, 0 for none; with its name. */
function signalAt(series: Bar[], i: number, s: Settings): { dir: 1 | -1 | 0; name: string } {
  const { bull, bear } = detectPatterns(series, i, s.ids, s.contextBars);
  if (bull.length === 0 && bear.length === 0) return { dir: 0, name: '' };
  if (s.minRelVolume > 0 && !(relativeVolume(series, i, 20) >= s.minRelVolume)) return { dir: 0, name: '' };
  const bar = series[i];
  const sma = bar.sma200;
  // Mixed signals on one bar cancel out.
  if (bull.length > 0 && bear.length === 0 && (!s.trendFilter || (sma != null && bar.close > sma))) {
    return { dir: 1, name: bull.map((id) => PATTERN_NAMES[id].bull).join(', ') };
  }
  if (bear.length > 0 && bull.length === 0 && (!s.trendFilter || (sma != null && bar.close < sma))) {
    return { dir: -1, name: bear.map((id) => PATTERN_NAMES[id].bear).join(', ') };
  }
  return { dir: 0, name: '' };
}

const handler: StrategyHandler = ({ series, index, params, position }) => {
  const pattern = (params.pattern as string) ?? 'all';
  const holdBars = (params.holdBars as number) ?? 5;
  const s: Settings = {
    ids: pattern === 'all' ? ALL_PATTERNS : (ALL_PATTERNS as string[]).includes(pattern) ? [pattern as PatternId] : ALL_PATTERNS,
    contextBars: (params.contextBars as number) ?? 5,
    trendFilter: (params.trendFilter as boolean) ?? false,
    minRelVolume: (params.minRelVolume as number) ?? 0,
  };

  const now = signalAt(series as Bar[], index, s);

  if (position) {
    const want = position === 'long' ? 1 : -1;
    const close = position === 'long' ? 'sell' : 'buy';
    if (now.dir === -want) return { action: close, reason: now.name };
    // Still in the hold window of the latest pattern in the trade's direction?
    for (let k = 0; k < holdBars && index - k >= 0; k++) {
      if (signalAt(series as Bar[], index - k, s).dir === want) return { action: 'hold', reason: '' };
    }
    return { action: close, reason: `Held ${holdBars} bars` };
  }

  if (now.dir === 1) return { action: 'buy', reason: now.name };
  if (now.dir === -1) return { action: 'sell', reason: now.name };
  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'candlestick-patterns',
  name: 'Candlestick Patterns',
  description: 'Buy bullish candlestick patterns (engulfing, hammer, morning star, piercing, harami, three soldiers, inside bar breakout) after a decline, short the bearish forms after a rise, hold a fixed number of bars. Optional 200 SMA and volume filters.',
  handler,
  parameters,
};

export default strategy;
