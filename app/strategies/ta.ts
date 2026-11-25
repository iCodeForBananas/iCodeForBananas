// Indicator arrays strategies compute over their own series, cached per series
// and settings. Each value at an index uses that bar and earlier ones only;
// NaN until there is enough history.

import { OHLCBar } from './types';

const cache = new WeakMap<OHLCBar[], Map<string, number[]>>();

export function memo(series: OHLCBar[], key: string, build: () => number[]): number[] {
  let byKey = cache.get(series);
  if (!byKey) {
    byKey = new Map();
    cache.set(series, byKey);
  }
  let out = byKey.get(key);
  if (!out) {
    out = build();
    byKey.set(key, out);
  }
  return out;
}

export function trueRange(series: OHLCBar[], i: number): number {
  const b = series[i];
  if (i === 0) return b.high - b.low;
  const pc = series[i - 1].close;
  return Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc));
}

/** Wilder's ATR. */
export function atrArray(series: OHLCBar[], period: number): number[] {
  return memo(series, `atr${period}`, () => {
    const out = new Array(series.length).fill(NaN);
    let sum = 0;
    let atr = NaN;
    for (let i = 0; i < series.length; i++) {
      const tr = trueRange(series, i);
      if (i < period) {
        sum += tr;
        if (i === period - 1) atr = sum / period;
      } else {
        atr = (atr * (period - 1) + tr) / period;
      }
      out[i] = atr;
    }
    return out;
  });
}

/** Simple moving average of any per-bar values. */
export function smaOf(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(NaN);
  let sum = 0;
  let valid = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (Number.isNaN(v)) {
      sum = 0;
      valid = 0;
      continue;
    }
    sum += v;
    valid++;
    if (valid > period) sum -= values[i - period];
    if (valid >= period) out[i] = sum / period;
  }
  return out;
}

/** Linearly weighted moving average: the newest value weighs `period`, the oldest 1. */
export function wmaOf(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(NaN);
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < values.length; i++) {
    let s = 0;
    let ok = true;
    for (let k = 0; k < period; k++) {
      const v = values[i - k];
      if (Number.isNaN(v)) {
        ok = false;
        break;
      }
      s += v * (period - k);
    }
    if (ok) out[i] = s / denom;
  }
  return out;
}

/** Population standard deviation over `period` values. */
export function stdevOf(values: number[], period: number): number[] {
  const mean = smaOf(values, period);
  const out = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    if (Number.isNaN(mean[i])) continue;
    let s = 0;
    for (let k = 0; k < period; k++) s += (values[i - k] - mean[i]) ** 2;
    out[i] = Math.sqrt(s / period);
  }
  return out;
}

/** Ordinary least squares line through the last `period` values, read at its newest point. */
export function linregOf(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(NaN);
  const xMean = (period - 1) / 2;
  let xx = 0;
  for (let x = 0; x < period; x++) xx += (x - xMean) ** 2;
  for (let i = period - 1; i < values.length; i++) {
    let yMean = 0;
    let ok = true;
    for (let x = 0; x < period; x++) {
      const v = values[i - period + 1 + x];
      if (Number.isNaN(v)) {
        ok = false;
        break;
      }
      yMean += v;
    }
    if (!ok) continue;
    yMean /= period;
    let xy = 0;
    for (let x = 0; x < period; x++) xy += (x - xMean) * (values[i - period + 1 + x] - yMean);
    const slope = xy / xx;
    out[i] = yMean + slope * (period - 1 - xMean);
  }
  return out;
}

export const closes = (series: OHLCBar[]) => memo(series, 'close', () => series.map((b) => b.close));
