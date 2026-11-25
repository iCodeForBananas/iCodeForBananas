// Squeeze Momentum (John Carter's TTM Squeeze, "Mastering the Trade", 2005;
// LazyBear's Squeeze Momentum Indicator, one of TradingView's most popular scripts)
// When the Bollinger Bands contract inside the Keltner Channel, volatility is
// coiled: the "squeeze" is on. When the bands expand back out, the squeeze
// fires, and price tends to move hard the way momentum points. Momentum is a
// linear regression of the close against the middle of the recent range.
// Enter when the squeeze fires, in momentum's direction; exit when momentum
// fades (a lower bar on a long, as LazyBear's histogram changes color) or,
// optionally, only when it crosses zero.

import { StrategyDefinition, StrategyHandler, StrategyParameter, OHLCBar } from './types';
import { memo, smaOf, stdevOf, linregOf, trueRange, closes } from './ta';

const parameters: StrategyParameter[] = [
  { key: 'length', name: 'Length', description: 'Bars for the bands, channel and momentum (LazyBear: 20)', type: 'number', default: 20, min: 10, max: 40, step: 1 },
  { key: 'bbMult', name: 'Bollinger Multiplier', description: 'Standard deviations for the Bollinger Bands (LazyBear: 2)', type: 'number', default: 2, min: 1, max: 3, step: 0.25 },
  { key: 'kcMult', name: 'Keltner Multiplier', description: 'Average ranges for the Keltner Channel (LazyBear: 1.5)', type: 'number', default: 1.5, min: 1, max: 3, step: 0.25 },
  { key: 'exitOnZero', name: 'Exit on Zero Cross', description: 'Hold until momentum crosses zero instead of exiting when it fades', type: 'boolean', default: false },
];

export interface Squeeze {
  /** 1 while the bands are inside the channel, 0 when not, NaN while warming up. */
  on: number[];
  momentum: number[];
}

export function getSqueeze(series: OHLCBar[], length: number, bbMult: number, kcMult: number): Squeeze {
  const key = `sqz-${length}-${bbMult}-${kcMult}`;
  const close = closes(series);
  const on = memo(series, `${key}-on`, () => {
    const basis = smaOf(close, length);
    const dev = stdevOf(close, length);
    const rangeMa = smaOf(series.map((_, i) => trueRange(series, i)), length);
    return series.map((_, i) => {
      if ([basis[i], dev[i], rangeMa[i]].some(Number.isNaN)) return NaN;
      return bbMult * dev[i] < kcMult * rangeMa[i] ? 1 : 0;
    });
  });
  const momentum = memo(series, `${key}-mom`, () => {
    const basis = smaOf(close, length);
    const delta = series.map((b, i) => {
      if (i < length - 1 || Number.isNaN(basis[i])) return NaN;
      let hi = -Infinity;
      let lo = Infinity;
      for (let k = i - length + 1; k <= i; k++) {
        hi = Math.max(hi, series[k].high);
        lo = Math.min(lo, series[k].low);
      }
      return b.close - ((hi + lo) / 2 + basis[i]) / 2;
    });
    return linregOf(delta, length);
  });
  return { on, momentum };
}

const handler: StrategyHandler = ({ series, index, params, position }) => {
  const length = (params.length as number) ?? 20;
  const bbMult = (params.bbMult as number) ?? 2;
  const kcMult = (params.kcMult as number) ?? 1.5;
  const exitOnZero = (params.exitOnZero as boolean) ?? false;
  if (index < 1) return { action: 'hold', reason: 'Warming up' };
  const { on, momentum } = getSqueeze(series, length, bbMult, kcMult);
  const m = momentum[index];
  const pm = momentum[index - 1];
  if ([m, pm, on[index], on[index - 1]].some(Number.isNaN)) return { action: 'hold', reason: 'Warming up' };

  if (position === 'long') {
    if (exitOnZero ? m < 0 : m < pm) return { action: 'sell', reason: exitOnZero ? 'Momentum crossed below zero' : 'Momentum fading' };
    return { action: 'hold', reason: '' };
  }
  if (position === 'short') {
    if (exitOnZero ? m > 0 : m > pm) return { action: 'buy', reason: exitOnZero ? 'Momentum crossed above zero' : 'Momentum fading' };
    return { action: 'hold', reason: '' };
  }

  const fired = on[index - 1] === 1 && on[index] === 0;
  if (fired && m > 0 && m > pm) return { action: 'buy', reason: `Squeeze fired, momentum up (${m.toFixed(2)})` };
  if (fired && m < 0 && m < pm) return { action: 'sell', reason: `Squeeze fired, momentum down (${m.toFixed(2)})` };
  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'squeeze-momentum',
  name: 'Squeeze Momentum (TTM)',
  description: 'When Bollinger Bands contract inside the Keltner Channel and then expand out, enter in the direction of momentum; exit when momentum fades or crosses zero.',
  handler,
  parameters,
};

export default strategy;
