// Volume indicators for strategies. Bars carry `volume` when their source has
// it (the bundled CSVs and the live Tradier feed both do); where it is
// missing these return NaN and a strategy should hold.
// Every value at an index uses that bar and earlier ones only.

import { OHLCBar } from './types';
import { sessionInfo } from './session';

export function hasVolume(bar: OHLCBar): boolean {
  return typeof bar.volume === 'number' && bar.volume >= 0;
}

/** Typical price, the bar's stand-in for where its volume traded. */
export const typicalPrice = (b: OHLCBar) => (b.high + b.low + b.close) / 3;

const vwapCache = new WeakMap<OHLCBar[], number[]>();

/**
 * Session VWAP: volume-weighted typical price since the session's first bar,
 * reset every day. NaN outside the session or where a bar has no volume.
 */
export function sessionVwap(series: OHLCBar[]): number[] {
  const cached = vwapCache.get(series);
  if (cached) return cached;
  const info = sessionInfo(series);
  const out: number[] = new Array(series.length).fill(NaN);
  let pv = 0;
  let vol = 0;
  let broken = false;
  for (let i = 0; i < series.length; i++) {
    if (info.sessionBar[i] < 0) continue;
    if (info.sessionBar[i] === 0) {
      pv = 0;
      vol = 0;
      broken = false;
    }
    const b = series[i];
    if (!hasVolume(b)) broken = true;
    if (broken) continue;
    pv += typicalPrice(b) * b.volume!;
    vol += b.volume!;
    out[i] = vol > 0 ? pv / vol : typicalPrice(b);
  }
  vwapCache.set(series, out);
  return out;
}

/** This bar's volume over the average of the `period` bars before it. NaN without enough history. */
export function relativeVolume(series: OHLCBar[], index: number, period: number): number {
  if (index < period || !hasVolume(series[index])) return NaN;
  let sum = 0;
  for (let i = index - period; i < index; i++) {
    if (!hasVolume(series[i])) return NaN;
    sum += series[i].volume!;
  }
  return sum > 0 ? series[index].volume! / (sum / period) : NaN;
}

/**
 * Relative volume of a session's opening bar against the same bar of the
 * prior `days` sessions: how unusual the open is, the "stock in play" test.
 */
export function openingRelativeVolume(series: OHLCBar[], index: number, days: number): number {
  const info = sessionInfo(series);
  const start = info.sessionStart[index];
  if (start < 0 || !hasVolume(series[start])) return NaN;
  let sum = 0;
  let found = 0;
  for (let i = start - 1; i >= 0 && found < days; i--) {
    if (info.sessionBar[i] !== 0) continue;
    if (!hasVolume(series[i])) return NaN;
    sum += series[i].volume!;
    found++;
  }
  return found === days && sum > 0 ? series[start].volume! / (sum / days) : NaN;
}

const obvCache = new WeakMap<OHLCBar[], number[]>();

/** On-Balance Volume (Granville, 1963): volume added on up closes, taken away on down closes. */
export function onBalanceVolume(series: OHLCBar[]): number[] {
  const cached = obvCache.get(series);
  if (cached) return cached;
  const out: number[] = new Array(series.length).fill(NaN);
  let obv = 0;
  for (let i = 0; i < series.length; i++) {
    if (!hasVolume(series[i])) {
      obv = 0;
      continue;
    }
    if (i > 0) {
      const d = series[i].close - series[i - 1].close;
      obv += d > 0 ? series[i].volume! : d < 0 ? -series[i].volume! : 0;
    }
    out[i] = obv;
  }
  obvCache.set(series, out);
  return out;
}
