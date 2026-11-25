// Every indicator the strategies compute, checked against a plain textbook
// version of its formula on real SPY daily bars. The references are written
// out loop by loop, the way the indicator's author defines it, independent of
// the code under test. They were also cross-checked once against the
// technicalindicators npm package (which rounds RSI and MFI to 2 decimals).

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { parsePriceCsv } from "@/app/lib/backtestReference";
import type { OHLCBar, IndicatorValues } from "./types";
import { calculateIndicatorsWithParams } from "@/app/lib/backtest-engine";
import { getRsiArray } from "./cumulative-rsi";
import { wilderRsi } from "./connors-rsi";
import { getMfi } from "./money-flow-index";
import { getKamaArray } from "./kama-trend";
import { calculateSMMA } from "./alligator";
import { getHma } from "./hull-ma";
import { getSupertrend } from "./supertrend";
import { getSqueeze } from "./squeeze-momentum";
import { atrArray, wmaOf, stdevOf } from "./ta";

const file = readdirSync("public/data").find((f) => /^SPY-1d-.*\.csv$/.test(f))!;
const s = parsePriceCsv(readFileSync(`public/data/${file}`, "utf8")).slice(-2500) as (OHLCBar & IndicatorValues)[];
const n = s.length;
const close = s.map((b) => b.close);
const high = s.map((b) => b.high);
const low = s.map((b) => b.low);

/** Largest absolute difference where both have a value, and how many bars that covered. */
function diff(a: (number | undefined)[], b: number[], from = 0) {
  let worst = 0;
  let count = 0;
  for (let i = from; i < n; i++) {
    const x = a[i];
    if (x == null || Number.isNaN(x) || Number.isNaN(b[i])) continue;
    worst = Math.max(worst, Math.abs(x - b[i]));
    count++;
  }
  return { worst, count };
}

function expectSame(a: (number | undefined)[], b: number[], minBars = n - 300, from = 0) {
  const { worst, count } = diff(a, b, from);
  expect(count).toBeGreaterThan(minBars);
  expect(worst).toBeLessThan(1e-8);
}

const sma = (v: number[], p: number) => v.map((_, i) => (i < p - 1 ? NaN : v.slice(i - p + 1, i + 1).reduce((x, y) => x + y) / p));
const wma = (v: number[], p: number) =>
  v.map((_, i) => {
    if (i < p - 1) return NaN;
    let num = 0;
    for (let k = 0; k < p; k++) num += v[i - k] * (p - k);
    return num / ((p * (p + 1)) / 2);
  });

/** Wilder's RSI: seed with the simple average of the first p changes, then smooth by 1/p. */
function textbookRsi(p: number) {
  const r = new Array(n).fill(NaN);
  let g = 0;
  let l = 0;
  for (let i = 1; i < n; i++) {
    const d = close[i] - close[i - 1];
    const up = Math.max(d, 0);
    const dn = Math.max(-d, 0);
    if (i < p) { g += up; l += dn; continue; }
    if (i === p) { g = (g + up) / p; l = (l + dn) / p; } else { g = (g * (p - 1) + up) / p; l = (l * (p - 1) + dn) / p; }
    r[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return r;
}

/** Wilder's ATR: true range, seeded with a simple average, then smoothed by 1/p. */
function textbookAtr(p: number) {
  const tr = s.map((b, i) => (i === 0 ? b.high - b.low : Math.max(b.high - b.low, Math.abs(b.high - close[i - 1]), Math.abs(b.low - close[i - 1]))));
  const r = new Array(n).fill(NaN);
  r[p - 1] = tr.slice(0, p).reduce((x, y) => x + y) / p;
  for (let i = p; i < n; i++) r[i] = (r[i - 1] * (p - 1) + tr[i]) / p;
  return r;
}

describe("indicators match their textbook formulas on real SPY bars", () => {
  const engine = calculateIndicatorsWithParams(s, [21], [20, 200], undefined, undefined);

  it("engine SMA, EMA, RSI(14) and ATR(14)", () => {
    expectSame(engine.map((b) => b.sma20), sma(close, 20));
    expectSame(engine.map((b) => b.sma200), sma(close, 200), n - 400);
    const k = 2 / 22;
    const ema = new Array(n).fill(NaN);
    ema[20] = close.slice(0, 21).reduce((x, y) => x + y) / 21;
    for (let i = 21; i < n; i++) ema[i] = close[i] * k + ema[i - 1] * (1 - k);
    expectSame(engine.map((b) => b.ema21), ema);
    expectSame(engine.map((b) => b.rsi), textbookRsi(14));
    // The engine seeds ATR from bar 1, the first with a prior close; the
    // reference also counts bar 0's range. The seed fades within a few dozen bars.
    expectSame(engine.map((b) => b.atr), textbookAtr(14), n - 400, 300);
  });

  it("strategy RSIs (RSI 2, cumulative RSI, R3, Connors RSI)", () => {
    expectSame(getRsiArray(s, 2), textbookRsi(2));
    expectSame(wilderRsi(close, 3), textbookRsi(3));
  });

  it("ATR, WMA, standard deviation and SMMA helpers", () => {
    expectSame(atrArray(s, 10), textbookAtr(10));
    expectSame(wmaOf(close, 27), wma(close, 27));
    const mean = sma(close, 20);
    const sd = close.map((_, i) => (i < 19 ? NaN : Math.sqrt(close.slice(i - 19, i + 1).reduce((a, c) => a + (c - mean[i]) ** 2, 0) / 20)));
    expectSame(stdevOf(close, 20), sd);
    const rma = new Array(n).fill(NaN);
    rma[12] = close.slice(0, 13).reduce((x, y) => x + y) / 13;
    for (let i = 13; i < n; i++) rma[i] = rma[i - 1] + (close[i] - rma[i - 1]) / 13;
    expectSame(calculateSMMA(close, 13), rma);
  });

  it("Hull MA: WMA(2 WMA(n/2) - WMA(n), sqrt n)", () => {
    const half = wma(close, 28);
    const full = wma(close, 55);
    const raw = full.map((f, i) => 2 * half[i] - f);
    const start = raw.findIndex((v) => !Number.isNaN(v));
    const tail = wma(raw.slice(start), 7);
    expectSame(getHma(s, 55), [...new Array(start).fill(NaN), ...tail]);
  });

  it("Kaufman's adaptive moving average (10, 2, 30)", () => {
    const k = new Array(n).fill(NaN);
    k[10] = close[10];
    for (let i = 11; i < n; i++) {
      let noise = 0;
      for (let j = i - 9; j <= i; j++) noise += Math.abs(close[j] - close[j - 1]);
      const er = noise ? Math.abs(close[i] - close[i - 10]) / noise : 0;
      const sc = (er * (2 / 3 - 2 / 31) + 2 / 31) ** 2;
      k[i] = k[i - 1] + sc * (close[i] - k[i - 1]);
    }
    expectSame(getKamaArray(s, 10, 2, 30), k);
  });

  it("Money Flow Index (14)", () => {
    const v = s.map((b) => b.volume ?? 0);
    const tp = s.map((b) => (b.high + b.low + b.close) / 3);
    const ref = new Array(n).fill(NaN);
    for (let i = 14; i < n; i++) {
      let up = 0;
      let down = 0;
      for (let k = i - 13; k <= i; k++) {
        if (tp[k] > tp[k - 1]) up += tp[k] * v[k];
        else if (tp[k] < tp[k - 1]) down += tp[k] * v[k];
      }
      ref[i] = down === 0 ? 100 : 100 - 100 / (1 + up / down);
    }
    expectSame(getMfi(s, 14), ref);
  });

  it("Supertrend direction, ported from TradingView's ta.supertrend", () => {
    const atr = textbookAtr(10);
    let upper = NaN;
    let lower = NaN;
    let dir = 1;
    const ref = new Array(n).fill(NaN);
    for (let i = 0; i < n; i++) {
      if (Number.isNaN(atr[i])) continue;
      const hl2 = (high[i] + low[i]) / 2;
      const bu = hl2 + 3 * atr[i];
      const bl = hl2 - 3 * atr[i];
      lower = Number.isNaN(lower) || bl > lower || close[i - 1] < lower ? bl : lower;
      upper = Number.isNaN(upper) || bu < upper || close[i - 1] > upper ? bu : upper;
      if (dir === 1 && close[i] < lower) dir = -1;
      else if (dir === -1 && close[i] > upper) dir = 1;
      ref[i] = dir;
    }
    expectSame(getSupertrend(s, 10, 3).dir, ref);
  });

  it("Squeeze momentum, LazyBear's linreg of close against the range midpoint", () => {
    const mean = sma(close, 20);
    const delta = close.map((c, i) => (i < 19 ? NaN : c - ((Math.max(...high.slice(i - 19, i + 1)) + Math.min(...low.slice(i - 19, i + 1))) / 2 + mean[i]) / 2));
    const ref = delta.map((_, i) => {
      if (i < 38) return NaN;
      const ys = delta.slice(i - 19, i + 1);
      const ym = ys.reduce((a, b) => a + b) / 20;
      let sxy = 0;
      let sxx = 0;
      ys.forEach((y, x) => { sxy += (x - 9.5) * (y - ym); sxx += (x - 9.5) ** 2; });
      return ym + (sxy / sxx) * 9.5;
    });
    expectSame(getSqueeze(s, 20, 2, 1.5).momentum, ref);
  });
});
