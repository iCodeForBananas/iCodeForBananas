// Supertrend (Olivier Seban; TradingView's most used built-in trend overlay)
// A trailing line an ATR multiple away from the bar's midpoint. While the
// close stays above the lower line the trend is up; a close through it flips
// the trend down and the line jumps above price. Buy the flip up, sell or
// short the flip down. Defaults are TradingView's: ATR 10, multiplier 3.

import { StrategyDefinition, StrategyHandler, StrategyParameter, OHLCBar } from './types';
import { atrArray, memo } from './ta';

const parameters: StrategyParameter[] = [
  { key: 'atrPeriod', name: 'ATR Period', description: 'Bars in the ATR (TradingView: 10)', type: 'number', default: 10, min: 5, max: 30, step: 1 },
  { key: 'multiplier', name: 'ATR Multiplier', description: 'Distance of the line in ATRs (TradingView: 3)', type: 'number', default: 3, min: 1, max: 6, step: 0.5 },
];

/** +1 uptrend, -1 downtrend, NaN while the ATR warms up; and the line itself. */
export function getSupertrend(series: OHLCBar[], period: number, mult: number): { dir: number[]; line: number[] } {
  const dir = memo(series, `st-dir-${period}-${mult}`, () => {
    const atr = atrArray(series, period);
    const d = new Array(series.length).fill(NaN);
    const line = new Array(series.length).fill(NaN);
    let upper = NaN;
    let lower = NaN;
    let trend = 1;
    for (let i = 0; i < series.length; i++) {
      if (Number.isNaN(atr[i])) continue;
      const mid = (series[i].high + series[i].low) / 2;
      const basicUpper = mid + mult * atr[i];
      const basicLower = mid - mult * atr[i];
      const prevClose = i > 0 ? series[i - 1].close : series[i].close;
      // The bands only tighten while price stays on their side.
      upper = Number.isNaN(upper) || basicUpper < upper || prevClose > upper ? basicUpper : upper;
      lower = Number.isNaN(lower) || basicLower > lower || prevClose < lower ? basicLower : lower;
      if (trend === 1 && series[i].close < lower) trend = -1;
      else if (trend === -1 && series[i].close > upper) trend = 1;
      d[i] = trend;
      line[i] = trend === 1 ? lower : upper;
    }
    memo(series, `st-line-${period}-${mult}`, () => line);
    return d;
  });
  // Building `dir` stored `line` under its own key, so this only reads it.
  return { dir, line: memo(series, `st-line-${period}-${mult}`, () => []) };
}

const handler: StrategyHandler = ({ series, index, params }) => {
  const period = (params.atrPeriod as number) ?? 10;
  const mult = (params.multiplier as number) ?? 3;
  if (index < 1) return { action: 'hold', reason: 'Warming up' };
  const { dir, line } = getSupertrend(series, period, mult);
  const now = dir[index];
  const before = dir[index - 1];
  if (Number.isNaN(now) || Number.isNaN(before)) return { action: 'hold', reason: 'Warming up' };
  if (now === 1 && before === -1) return { action: 'buy', reason: `Supertrend flipped up (line ${line[index].toFixed(2)})` };
  if (now === -1 && before === 1) return { action: 'sell', reason: `Supertrend flipped down (line ${line[index].toFixed(2)})` };
  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'supertrend',
  name: 'Supertrend',
  description: 'Buy when the close breaks above the ATR trailing line and the Supertrend flips up; sell or short when it flips down.',
  handler,
  parameters,
};

export default strategy;
