// Parabolic SAR (J. Welles Wilder, "New Concepts in Technical Trading
// Systems", 1978; a TradingView built-in)
// A stop that trails price and accelerates as the trend makes new extremes.
// When price touches it, the trend reverses and the stop jumps to the other
// side. Always in the market in Wilder's design: buy the flip up, sell or
// short the flip down. An optional 200 SMA filter only takes flips with the
// longer trend, since SAR whipsaws in ranges.

import { StrategyDefinition, StrategyHandler, StrategyParameter, OHLCBar } from './types';
import { memo } from './ta';

const parameters: StrategyParameter[] = [
  { key: 'step', name: 'Acceleration Step', description: 'Added each new extreme (Wilder: 0.02)', type: 'number', default: 0.02, min: 0.01, max: 0.05, step: 0.01 },
  { key: 'maxStep', name: 'Max Acceleration', description: 'Cap on the acceleration (Wilder: 0.2)', type: 'number', default: 0.2, min: 0.1, max: 0.5, step: 0.05 },
  { key: 'trendFilter', name: 'Trend Filter (200 SMA)', description: 'Only buy above the 200 SMA, and only short below it', type: 'boolean', default: false },
];

/** +1 while SAR is below price, -1 while above; NaN on the first bar. */
export function getSarDirection(series: OHLCBar[], step: number, maxStep: number): number[] {
  return memo(series, `sar-${step}-${maxStep}`, () => {
    const out = new Array(series.length).fill(NaN);
    if (series.length < 2) return out;
    let up = series[1].close >= series[0].close;
    let sar = up ? series[0].low : series[0].high;
    let ep = up ? series[1].high : series[1].low;
    let af = step;
    out[1] = up ? 1 : -1;
    for (let i = 2; i < series.length; i++) {
      const b = series[i];
      sar = sar + af * (ep - sar);
      // SAR may not move inside the prior two bars' range.
      if (up) sar = Math.min(sar, series[i - 1].low, series[i - 2].low);
      else sar = Math.max(sar, series[i - 1].high, series[i - 2].high);
      if (up && b.low < sar) {
        up = false;
        sar = ep;
        ep = b.low;
        af = step;
      } else if (!up && b.high > sar) {
        up = true;
        sar = ep;
        ep = b.high;
        af = step;
      } else if (up && b.high > ep) {
        ep = b.high;
        af = Math.min(af + step, maxStep);
      } else if (!up && b.low < ep) {
        ep = b.low;
        af = Math.min(af + step, maxStep);
      }
      out[i] = up ? 1 : -1;
    }
    return out;
  });
}

const handler: StrategyHandler = ({ current, series, index, params, position }) => {
  const step = (params.step as number) ?? 0.02;
  const maxStep = (params.maxStep as number) ?? 0.2;
  const trendFilter = (params.trendFilter as boolean) ?? false;
  if (index < 2) return { action: 'hold', reason: 'Warming up' };
  const dir = getSarDirection(series, step, maxStep);
  const flippedUp = dir[index] === 1 && dir[index - 1] === -1;
  const flippedDown = dir[index] === -1 && dir[index - 1] === 1;
  const sma = current.sma200;
  const up = !trendFilter || (sma != null && current.close > sma);
  const down = !trendFilter || (sma != null && current.close < sma);

  // Exits always follow the flip; entries can wait for the trend filter.
  if (position === 'long' && flippedDown) return { action: 'sell', reason: 'SAR flipped above price' };
  if (position === 'short' && flippedUp) return { action: 'buy', reason: 'SAR flipped below price' };
  if (position) return { action: 'hold', reason: '' };
  if (flippedUp && up) return { action: 'buy', reason: 'SAR flipped below price' };
  if (flippedDown && down) return { action: 'sell', reason: 'SAR flipped above price' };
  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'parabolic-sar',
  name: 'Parabolic SAR',
  description: "Wilder's accelerating trailing stop: buy when it flips below price, sell or short when it flips above. Optional 200 SMA filter.",
  handler,
  parameters,
};

export default strategy;
