// Hull Moving Average (Alan Hull, 2005; a TradingView built-in and the base of
// many popular community strategies)
// HMA(n) = WMA(2 * WMA(n/2) - WMA(n), sqrt(n)): nearly lag-free yet smooth.
// Trade its turns: buy when it starts rising, sell or short when it starts
// falling. 55 is the length most TradingView scripts default to for swing
// trading; shorter lengths suit hourly bars.

import { StrategyDefinition, StrategyHandler, StrategyParameter, OHLCBar } from './types';
import { memo, wmaOf, closes } from './ta';

const parameters: StrategyParameter[] = [
  { key: 'length', name: 'HMA Length', description: 'Bars in the Hull MA (common: 55 swing, 21 faster)', type: 'number', default: 55, min: 9, max: 100, step: 1 },
  { key: 'trendFilter', name: 'Trend Filter (200 SMA)', description: 'Only buy above the 200 SMA, and only short below it', type: 'boolean', default: false },
];

export function getHma(series: OHLCBar[], length: number): number[] {
  return memo(series, `hma${length}`, () => {
    const close = closes(series);
    const half = wmaOf(close, Math.max(1, Math.round(length / 2)));
    const full = wmaOf(close, length);
    const raw = half.map((h, i) => 2 * h - full[i]);
    return wmaOf(raw, Math.max(1, Math.round(Math.sqrt(length))));
  });
}

const handler: StrategyHandler = ({ current, series, index, params, position }) => {
  const length = (params.length as number) ?? 55;
  const trendFilter = (params.trendFilter as boolean) ?? false;
  if (index < 2) return { action: 'hold', reason: 'Warming up' };
  const hma = getHma(series, length);
  const [a, b, c] = [hma[index - 2], hma[index - 1], hma[index]];
  if ([a, b, c].some(Number.isNaN)) return { action: 'hold', reason: 'Warming up' };
  const turnedUp = b <= a && c > b;
  const turnedDown = b >= a && c < b;
  const sma = current.sma200;
  const up = !trendFilter || (sma != null && current.close > sma);
  const down = !trendFilter || (sma != null && current.close < sma);

  if (position === 'long' && turnedDown) return { action: 'sell', reason: `HMA ${length} turned down` };
  if (position === 'short' && turnedUp) return { action: 'buy', reason: `HMA ${length} turned up` };
  if (position) return { action: 'hold', reason: '' };
  if (turnedUp && up) return { action: 'buy', reason: `HMA ${length} turned up` };
  if (turnedDown && down) return { action: 'sell', reason: `HMA ${length} turned down` };
  return { action: 'hold', reason: '' };
};

const strategy: StrategyDefinition = {
  id: 'hull-ma',
  name: 'Hull MA Turn',
  description: 'Buy when the Hull Moving Average turns up, sell or short when it turns down. Optional 200 SMA filter.',
  handler,
  parameters,
};

export default strategy;
