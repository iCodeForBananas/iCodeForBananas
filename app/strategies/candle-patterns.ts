// Candlestick pattern detectors (Steve Nison, "Japanese Candlestick Charting
// Techniques", 1991; Thomas Bulkowski, "Encyclopedia of Candlestick Charts",
// 2008). Each takes the series and an index and looks only at that bar and the
// ones before it. A pattern's shape is in proportions of the bar (body, range,
// shadows) so the same rules work on any price and any timeframe; "long" and
// "small" bodies are measured against the average body of recent bars.
//
// Research is clear that a pattern alone is a weak signal on liquid US stocks
// (Marshall, Young & Rose, "Candlestick technical trading strategies: Can they
// create value for investors?", Journal of Banking & Finance, 2006). Where they
// help, it is as reversals at the end of a move, so every reversal pattern
// here is only reported after a decline (bullish) or a rise (bearish).

import { OHLCBar } from './types';

export type PatternId =
  | 'engulfing'
  | 'hammer'
  | 'star'
  | 'piercing'
  | 'harami'
  | 'soldiers'
  | 'inside-bar';

export const PATTERN_NAMES: Record<PatternId, { bull: string; bear: string }> = {
  engulfing: { bull: 'Bullish engulfing', bear: 'Bearish engulfing' },
  hammer: { bull: 'Hammer', bear: 'Shooting star' },
  star: { bull: 'Morning star', bear: 'Evening star' },
  piercing: { bull: 'Piercing line', bear: 'Dark cloud cover' },
  harami: { bull: 'Bullish harami', bear: 'Bearish harami' },
  soldiers: { bull: 'Three white soldiers', bear: 'Three black crows' },
  'inside-bar': { bull: 'Inside bar breakout up', bear: 'Inside bar breakout down' },
};

export const ALL_PATTERNS = Object.keys(PATTERN_NAMES) as PatternId[];

export const body = (b: OHLCBar) => Math.abs(b.close - b.open);
export const range = (b: OHLCBar) => b.high - b.low;
export const upperShadow = (b: OHLCBar) => b.high - Math.max(b.open, b.close);
export const lowerShadow = (b: OHLCBar) => Math.min(b.open, b.close) - b.low;
export const isBull = (b: OHLCBar) => b.close > b.open;
export const isBear = (b: OHLCBar) => b.close < b.open;
export const bodyMid = (b: OHLCBar) => (b.open + b.close) / 2;

/** A doji: open and close within a tenth of the range. */
export const isDoji = (b: OHLCBar) => range(b) > 0 && body(b) <= 0.1 * range(b);

/** Average body of the `n` bars before `index`, NaN without them. */
export function averageBody(series: OHLCBar[], index: number, n = 10): number {
  if (index < n) return NaN;
  let sum = 0;
  for (let i = index - n; i < index; i++) sum += body(series[i]);
  return sum / n;
}

/**
 * The move into the bar before the pattern: -1 if the close `bars` bars before
 * the pattern's first bar is above the close just before it (a decline), +1 for
 * a rise, 0 when flat or `bars` is 0 (context off, always allowed).
 */
export function priorTrend(series: OHLCBar[], firstBar: number, bars: number): -1 | 0 | 1 {
  if (bars <= 0) return 0;
  const end = firstBar - 1;
  const begin = end - bars;
  if (begin < 0) return 0;
  const d = series[end].close - series[begin].close;
  return d < 0 ? -1 : d > 0 ? 1 : 0;
}

export type Direction = 1 | -1 | 0;

/** Bars each pattern spans, so its context is measured before its first bar. */
export const PATTERN_BARS: Record<PatternId, number> = {
  engulfing: 2, hammer: 1, star: 3, piercing: 2, harami: 2, soldiers: 3, 'inside-bar': 2,
};

/**
 * The shape alone: +1 for the bullish form ending at `index`, -1 for the
 * bearish form, 0 for neither. No trend context.
 */
export function patternShape(series: OHLCBar[], index: number, id: PatternId): Direction {
  const span = PATTERN_BARS[id];
  if (index < span - 1) return 0;
  const c = series[index];
  const p = series[index - 1];
  const avg = averageBody(series, index - span + 1);
  const long = (b: OHLCBar) => !Number.isNaN(avg) && body(b) > avg;
  const small = (b: OHLCBar, ref: OHLCBar) => body(b) <= 0.3 * body(ref);

  switch (id) {
    case 'engulfing':
      // Today's body swallows yesterday's opposite-colored body.
      if (isBear(p) && isBull(c) && c.open <= p.close && c.close >= p.open && body(c) > body(p)) return 1;
      if (isBull(p) && isBear(c) && c.open >= p.close && c.close <= p.open && body(c) > body(p)) return -1;
      return 0;
    case 'hammer': {
      // Long lower shadow (rejected lows) or long upper shadow (rejected highs), small body at the other end.
      const r = range(c);
      if (r <= 0 || body(c) > 0.35 * r) return 0;
      if (lowerShadow(c) >= 2 * body(c) && lowerShadow(c) >= 0.6 * r && upperShadow(c) <= 0.15 * r) return 1;
      if (upperShadow(c) >= 2 * body(c) && upperShadow(c) >= 0.6 * r && lowerShadow(c) <= 0.15 * r) return -1;
      return 0;
    }
    case 'star': {
      // A long bar, a small "star", then a bar closing past the middle of the first.
      const a = series[index - 2];
      if (!long(a) || !small(p, a)) return 0;
      if (isBear(a) && isBull(c) && c.close > bodyMid(a)) return 1;
      if (isBull(a) && isBear(c) && c.close < bodyMid(a)) return -1;
      return 0;
    }
    case 'piercing':
      // Opens past yesterday's close, closes back past the middle of its body but not through it.
      if (long(p) && isBear(p) && isBull(c) && c.open < p.close && c.close > bodyMid(p) && c.close < p.open) return 1;
      if (long(p) && isBull(p) && isBear(c) && c.open > p.close && c.close < bodyMid(p) && c.close > p.open) return -1;
      return 0;
    case 'harami': {
      // A small body inside a long opposite body: the move stalls.
      const inside = Math.max(c.open, c.close) <= Math.max(p.open, p.close) && Math.min(c.open, c.close) >= Math.min(p.open, p.close);
      if (!long(p) || !inside || body(c) > 0.5 * body(p)) return 0;
      if (isBear(p) && isBull(c)) return 1;
      if (isBull(p) && isBear(c)) return -1;
      return 0;
    }
    case 'soldiers': {
      // Three same-colored bars, each closing further, each opening inside the last body, closing near its extreme.
      const bars = [series[index - 2], p, c];
      const up = bars.every((b, i) => isBull(b) && upperShadow(b) <= 0.3 * range(b) && (i === 0 || (b.close > bars[i - 1].close && b.open >= bars[i - 1].open && b.open <= bars[i - 1].close)));
      if (up) return 1;
      const down = bars.every((b, i) => isBear(b) && lowerShadow(b) <= 0.3 * range(b) && (i === 0 || (b.close < bars[i - 1].close && b.open <= bars[i - 1].open && b.open >= bars[i - 1].close)));
      return down ? -1 : 0;
    }
    case 'inside-bar': {
      // The bar before this one sat inside its own predecessor; this bar closes out of it.
      if (index < 2) return 0;
      const mother = series[index - 2];
      if (!(p.high <= mother.high && p.low >= mother.low)) return 0;
      if (c.close > mother.high) return 1;
      if (c.close < mother.low) return -1;
      return 0;
    }
  }
}

/** Continuation patterns don't need a prior move against them. */
const CONTINUATION: ReadonlySet<PatternId> = new Set(['soldiers', 'inside-bar']);

/**
 * The pattern with its context: a bullish reversal only after a decline over
 * `contextBars`, a bearish one only after a rise. Continuation patterns pass as is.
 */
export function detectPattern(series: OHLCBar[], index: number, id: PatternId, contextBars: number): Direction {
  const dir = patternShape(series, index, id);
  if (dir === 0 || CONTINUATION.has(id) || contextBars <= 0) return dir;
  const trend = priorTrend(series, index - PATTERN_BARS[id] + 1, contextBars);
  return trend === -dir ? dir : 0;
}

/** Every pattern in `ids` that fires at `index`, bullish and bearish. */
export function detectPatterns(series: OHLCBar[], index: number, ids: PatternId[], contextBars: number): { bull: PatternId[]; bear: PatternId[] } {
  const bull: PatternId[] = [];
  const bear: PatternId[] = [];
  for (const id of ids) {
    const d = detectPattern(series, index, id, contextBars);
    if (d > 0) bull.push(id);
    else if (d < 0) bear.push(id);
  }
  return { bull, bear };
}
