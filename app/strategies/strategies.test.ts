import { describe, expect, it } from "vitest";
import { getDefaultParams, type OHLCBar, type IndicatorValues, type StrategyDefinition } from "./index";
import ibsMeanReversion, { ibs } from "./ibs-mean-reversion";
import double7s from "./double-7s";
import cumulativeRsi, { getRsiArray, cumulativeRsiAt } from "./cumulative-rsi";
import turtle, { priorChannel } from "./turtle";
import faberTrend from "./faber-trend";
import timeSeriesMomentum from "./time-series-momentum";
import connorsRsi, { streaks, wilderRsi, getConnorsRsiArray } from "./connors-rsi";
import turnOfMonth, { monthCalendar } from "./turn-of-month";
import ichimoku, { midpointArray } from "./ichimoku";
import kamaTrend, { getKamaArray } from "./kama-trend";
import supplyDemand, { getZoneSeries, zoneParamsFrom } from "./supply-demand";
import macdCrossover from "./macd-crossover";
import emaPullback from "./ema-pullback";
import { deriveRequiredIndicators } from "@/app/lib/backtest-engine";

type Bar = OHLCBar & IndicatorValues;

const DAY = 24 * 60 * 60 * 1000;

/** Flat-range bars from closes: high/low one point either side. */
function fromCloses(closes: number[], extra: Partial<Bar> = {}): Bar[] {
  return closes.map((close, i) => ({ time: i * DAY, open: close, high: close + 1, low: close - 1, close, ...extra }));
}

function signal(
  strategy: StrategyDefinition,
  series: Bar[],
  position: "long" | "short" | null = null,
  params: Record<string, number | boolean | string> = {},
) {
  const index = series.length - 1;
  return strategy.handler({
    current: series[index],
    previous: series[index - 1] ?? null,
    index,
    series,
    params: { ...getDefaultParams(strategy.id), ...params },
    position,
  }).action;
}

describe("IBS mean reversion", () => {
  it("measures where the close sits in the bar's range", () => {
    expect(ibs({ high: 110, low: 100, close: 102 })).toBeCloseTo(0.2);
    expect(ibs({ high: 100, low: 100, close: 100 })).toBe(0.5);
  });

  it("buys a close near the low and sells a close near the high", () => {
    const nearLow: Bar = { time: 0, open: 108, high: 110, low: 100, close: 101 };
    const nearHigh: Bar = { time: 0, open: 101, high: 110, low: 100, close: 109 };
    expect(signal(ibsMeanReversion, [nearLow])).toBe("buy");
    expect(signal(ibsMeanReversion, [nearHigh], "long")).toBe("sell");
  });

  it("shorts a close near the high and covers a close near the low", () => {
    const nearHigh: Bar = { time: 0, open: 101, high: 110, low: 100, close: 109 };
    const nearLow: Bar = { time: 0, open: 108, high: 110, low: 100, close: 101 };
    const middle: Bar = { time: 0, open: 104, high: 110, low: 100, close: 105 };
    expect(signal(ibsMeanReversion, [nearHigh], null)).toBe("sell");
    expect(signal(ibsMeanReversion, [nearLow], "short")).toBe("buy");
    expect(signal(ibsMeanReversion, [middle], "short")).toBe("hold");
    expect(signal(ibsMeanReversion, [{ ...nearHigh, sma200: 100 }], null, { trendFilter: true })).toBe("hold");
  });

  it("skips entries under the 200 SMA when the trend filter is on", () => {
    const nearLow: Bar = { time: 0, open: 108, high: 110, low: 100, close: 101, sma200: 120 };
    expect(signal(ibsMeanReversion, [nearLow], null, { trendFilter: true })).toBe("hold");
  });
});

describe("Double 7s", () => {
  it("buys a 7-bar closing low above the 200 SMA", () => {
    expect(signal(double7s, fromCloses([110, 109, 108, 107, 106, 105, 104], { sma200: 90 }))).toBe("buy");
  });

  it("ignores the same low under the 200 SMA", () => {
    expect(signal(double7s, fromCloses([110, 109, 108, 107, 106, 105, 104], { sma200: 120 }))).toBe("hold");
  });

  it("sells a 7-bar closing high", () => {
    expect(signal(double7s, fromCloses([100, 101, 102, 103, 104, 105, 106]), "long")).toBe("sell");
  });
});

describe("Cumulative RSI", () => {
  it("sums the last N RSI readings", () => {
    const rsi = [NaN, NaN, 10, 20, 30];
    expect(cumulativeRsiAt(rsi, 4, 2)).toBe(50);
    expect(Number.isNaN(cumulativeRsiAt(rsi, 2, 2))).toBe(true);
  });

  it("matches a Wilder RSI that pins at 0 and 100 on one-way moves", () => {
    expect(getRsiArray(fromCloses([5, 4, 3, 2]), 2)[3]).toBe(0);
    expect(getRsiArray(fromCloses([1, 2, 3, 4]), 2)[3]).toBe(100);
  });

  it("buys after consecutive down closes above the 200 SMA and sells the bounce", () => {
    const series = fromCloses([100, 101, 102, 101, 100, 99, 98], { sma200: 50 });
    expect(signal(cumulativeRsi, series)).toBe("buy");
    expect(signal(cumulativeRsi, fromCloses([100, 101, 102, 101, 100, 99, 98, 103], { sma200: 50 }), "long")).toBe("sell");
  });
});

describe("Turtle breakout", () => {
  it("reads the channel from the bars before the current one", () => {
    const series = fromCloses([10, 20, 30]);
    expect(priorChannel(series, 2, 2)).toEqual({ high: 21, low: 9 });
    expect(priorChannel(series, 1, 2)).toBeNull();
  });

  it("buys a close above the entry channel", () => {
    const closes = [...Array(20).fill(100), 105];
    expect(signal(turtle, fromCloses(closes))).toBe("buy");
  });

  it("exits a long on the shorter channel, not the entry one", () => {
    const closes = [...Array(20).fill(100), 98];
    expect(signal(turtle, fromCloses(closes), "long")).toBe("sell");
    // 99.5 stays above the 10-bar low of 99, so the long holds.
    expect(signal(turtle, fromCloses([...Array(20).fill(100), 99.5]), "long")).toBe("hold");
  });

  it("covers a short on a close above the exit channel", () => {
    const closes = [...Array(20).fill(100), 102];
    expect(signal(turtle, fromCloses(closes), "short")).toBe("buy");
  });
});

describe("MA trend filter (Faber)", () => {
  const bar = (close: number): Bar => ({ time: 0, open: close, high: close, low: close, close, sma200: 100 });

  it("holds inside the band and switches outside it", () => {
    expect(signal(faberTrend, [bar(100.5)])).toBe("hold");
    expect(signal(faberTrend, [bar(102)])).toBe("buy");
    expect(signal(faberTrend, [bar(98)], "long")).toBe("sell");
  });

  it("asks the engine for the SMA length it reads", () => {
    const req = deriveRequiredIndicators("faber-trend", [{ smaPeriod: 150, bandPercent: 1 }]);
    expect(req.requiredSMAs).toContain(150);
    expect(req.requiredEMAs).not.toContain(150);
  });
});

describe("Time-series momentum", () => {
  const rising = fromCloses(Array.from({ length: 30 }, (_, i) => 100 + i));
  const falling = fromCloses(Array.from({ length: 30 }, (_, i) => 200 - i));

  it("waits for a full lookback", () => {
    expect(signal(timeSeriesMomentum, rising.slice(0, 20), null, { lookback: 21 })).toBe("hold");
  });

  it("buys a positive trailing return and sells a negative one", () => {
    expect(signal(timeSeriesMomentum, rising, null, { lookback: 21 })).toBe("buy");
    expect(signal(timeSeriesMomentum, falling, "long", { lookback: 21 })).toBe("sell");
  });

  it("holds inside the threshold band", () => {
    const flat = fromCloses(Array.from({ length: 30 }, (_, i) => 100 + (i % 2)));
    expect(signal(timeSeriesMomentum, flat, "long", { lookback: 21, threshold: 2 })).toBe("hold");
  });
});

describe("ConnorsRSI", () => {
  it("counts up and down streaks", () => {
    expect(streaks(fromCloses([10, 11, 12, 12, 11, 10, 9, 10]))).toEqual([0, 1, 2, 0, -1, -2, -3, 1]);
  });

  it("matches a plain Wilder RSI where it overlaps", () => {
    const closes = [44, 44.3, 44.1, 44.6, 45.2, 45.1, 45.6, 46.1, 45.9, 46.3];
    const rsi = wilderRsi(closes, 3);
    expect(rsi.slice(0, 3).every(Number.isNaN)).toBe(true);
    expect(rsi.slice(3).every((v) => v >= 0 && v <= 100)).toBe(true);
  });

  it("stays between 0 and 100 and buys a sharp drop in an uptrend", () => {
    const closes = Array.from({ length: 130 }, (_, i) => 100 + i * 0.5 + (i % 3 === 0 ? 1 : 0));
    closes.push(closes[closes.length - 1] - 4, closes[closes.length - 1] - 8, closes[closes.length - 1] - 12);
    const series = fromCloses(closes, { sma200: 50 });
    const crsi = getConnorsRsiArray(series, 3, 2, 100).filter((v) => !Number.isNaN(v));
    expect(crsi.length).toBeGreaterThan(0);
    expect(crsi.every((v) => v >= 0 && v <= 100)).toBe(true);
    expect(signal(connorsRsi, series)).toBe("buy");
    const belowTrend = series.map((b) => ({ ...b, sma200: 1000 }));
    expect(signal(connorsRsi, belowTrend)).toBe("hold");
  });

  it("never sells while flat", () => {
    const series = fromCloses([...Array.from({ length: 130 }, (_, i) => 100 + i), 260], { sma200: 50 });
    expect(signal(connorsRsi, series, null)).toBe("hold");
    expect(signal(connorsRsi, series, "long")).toBe("sell");
  });
});

describe("Turn of the month", () => {
  // Weekday daily bars at 14:30 UTC from 2024-01-22 through 2024-02-09.
  const days: Bar[] = [];
  for (let t = Date.UTC(2024, 0, 22, 14, 30); t <= Date.UTC(2024, 1, 9, 14, 30); t += DAY) {
    const weekday = new Date(t).getUTCDay();
    if (weekday !== 0 && weekday !== 6) days.push({ time: t, open: 100, high: 101, low: 99, close: 100 });
  }
  const at = (y: number, m: number, d: number) => days.findIndex((b) => b.time === Date.UTC(y, m, d, 14, 30));

  it("numbers trading days and counts the ones left", () => {
    const cal = monthCalendar(days);
    const jan31 = at(2024, 0, 31);
    expect(cal.daysLeft[jan31]).toBe(0);
    expect(cal.dayOfMonth[at(2024, 1, 5)]).toBe(3);
    expect(cal.daysLeft[at(2024, 0, 30)]).toBe(1);
  });

  it("buys the last trading day and sells the third", () => {
    expect(signal(turnOfMonth, days.slice(0, at(2024, 0, 30) + 1))).toBe("hold");
    expect(signal(turnOfMonth, days.slice(0, at(2024, 0, 31) + 1))).toBe("buy");
    expect(signal(turnOfMonth, days.slice(0, at(2024, 1, 2) + 1), "long")).toBe("hold");
    expect(signal(turnOfMonth, days.slice(0, at(2024, 1, 5) + 1), "long")).toBe("sell");
  });

  it("only acts on a date's last bar on intraday data", () => {
    const t = Date.UTC(2024, 0, 31, 14, 30);
    const bars: Bar[] = [0, 1, 2].map((k) => ({ time: t + k * 60 * 60 * 1000, open: 1, high: 1, low: 1, close: 1 }));
    bars.push({ time: Date.UTC(2024, 1, 1, 14, 30), open: 1, high: 1, low: 1, close: 1 });
    const cal = monthCalendar(bars);
    expect(cal.lastBarOfDay).toEqual([false, false, true, true]);
    expect(cal.daysLeft.slice(0, 3)).toEqual([0, 0, 0]);
  });
});

describe("Ichimoku", () => {
  it("computes the range midpoint like a direct scan", () => {
    const series = fromCloses([5, 9, 2, 7, 7, 1, 8, 3, 6, 4]);
    const mid = midpointArray(series, 3);
    for (let i = 2; i < series.length; i++) {
      const window = series.slice(i - 2, i + 1);
      expect(mid[i]).toBe((Math.max(...window.map((b) => b.high)) + Math.min(...window.map((b) => b.low))) / 2);
    }
  });

  it("buys a steady uptrend above the cloud and exits under the Kijun", () => {
    const up = fromCloses(Array.from({ length: 120 }, (_, i) => 100 + i));
    expect(signal(ichimoku, up)).toBe("buy");
    const dropped = [...up, ...fromCloses([150]).map((b) => ({ ...b, time: up.length * DAY }))];
    expect(signal(ichimoku, dropped, "long")).toBe("sell");
  });

  it("asks for no engine indicators beyond the defaults", () => {
    const { requiredSMAs, requiredEMAs } = deriveRequiredIndicators("ichimoku", [getDefaultParams("ichimoku")]);
    expect(requiredSMAs.sort((a, b) => a - b)).toEqual([20, 50, 200]);
    expect(requiredEMAs.sort((a, b) => a - b)).toEqual([9, 21]);
  });
});

describe("KAMA", () => {
  it("tracks a flat series exactly and lags a trend", () => {
    expect(getKamaArray(fromCloses(Array(30).fill(50)), 10, 2, 30).slice(10).every((v) => v === 50)).toBe(true);
    const kama = getKamaArray(fromCloses(Array.from({ length: 40 }, (_, i) => 100 + i)), 10, 2, 30);
    expect(kama[39]).toBeLessThan(139);
    expect(kama[39]).toBeGreaterThan(kama[20]);
  });

  it("buys an upturn and sells a downturn", () => {
    const vee = fromCloses([...Array.from({ length: 40 }, (_, i) => 200 - i), ...Array.from({ length: 15 }, (_, i) => 161 + i * 2)]);
    expect(signal(kamaTrend, vee)).toBe("buy");
    const peak = fromCloses([...Array.from({ length: 40 }, (_, i) => 100 + i), ...Array.from({ length: 15 }, (_, i) => 139 - i * 2)]);
    expect(signal(kamaTrend, peak, "long")).toBe("sell");
  });

  it("asks for no engine indicators beyond the defaults", () => {
    const { requiredSMAs, requiredEMAs } = deriveRequiredIndicators("kama-trend", [getDefaultParams("kama-trend")]);
    expect(requiredSMAs.sort((a, b) => a - b)).toEqual([20, 50, 200]);
    expect(requiredEMAs.sort((a, b) => a - b)).toEqual([9, 21]);
  });
});

describe("Supply & demand zones", () => {
  const bar = (i: number, open: number, high: number, low: number, close: number): Bar => ({ time: i * DAY, open, high, low, close });
  // Bars with a body over half their range, so none of them counts as a base.
  const warmup = (n: number) => Array.from({ length: n }, (_, i) => bar(i, 99.2, 101, 99, 100.8));
  const withBars = (head: Bar[], ...rows: [number, number, number, number][]) =>
    [...head, ...rows.map(([o, h, l, c], k) => bar(head.length + k, o, h, l, c))];
  const params = { atrPeriod: 3 };

  // Two boring candles, then a rally candle leaving them: demand at 99.5-100.2.
  const demandBuilt = withBars(warmup(6), [100, 101, 99.5, 100.2], [100.1, 101, 99.6, 100], [100.2, 105.2, 100, 105], [105, 105.3, 103.6, 103.8]);
  // Two boring candles, then a drop candle leaving them: supply at 100-101.
  const supplyBuilt = withBars(warmup(6), [100, 101, 99.5, 100.2], [100.1, 101, 99.6, 100], [100, 100.2, 94.8, 95], [95, 97.2, 94.9, 97]);

  it("finds a demand zone from base to impulse, from the impulse bar on", () => {
    const z = getZoneSeries(demandBuilt, zoneParamsFrom(params));
    expect(Number.isNaN(z.demandTop[7])).toBe(true);
    expect(z.demandTop[8]).toBeCloseTo(100.2);
    expect(z.demandBottom[8]).toBeCloseTo(99.5);
  });

  it("buys a bounce off a fresh demand zone and sells when it breaks", () => {
    const bounced = withBars(demandBuilt, [103.8, 104, 100, 102.5]);
    expect(signal(supplyDemand, bounced, null, params)).toBe("buy");
    expect(signal(supplyDemand, bounced, null, { ...params, mode: "breakout" })).toBe("hold");
    const broken = withBars(bounced, [102.5, 102.6, 98, 98.5]);
    expect(signal(supplyDemand, broken, "long", params)).toBe("sell");
  });

  it("skips a bounce once the zone has used up its touches", () => {
    const retests = withBars(demandBuilt, [103.8, 104, 100, 102.5], [102.5, 104.4, 102.4, 104.2], [104.2, 104.3, 100.1, 102.6]);
    expect(signal(supplyDemand, retests, null, { ...params, maxTouches: 2 })).toBe("buy");
    expect(signal(supplyDemand, retests, null, { ...params, maxTouches: 1 })).toBe("hold");
  });

  it("buys a breakout through supply and flips the zone to demand", () => {
    const broke = withBars(supplyBuilt, [97, 102, 96.8, 101.5]);
    expect(signal(supplyDemand, broke, null, { ...params, mode: "breakout" })).toBe("buy");
    expect(signal(supplyDemand, broke, null, params)).toBe("hold");
    const z = getZoneSeries(broke, zoneParamsFrom(params));
    expect([z.demandBottom[broke.length - 1], z.demandTop[broke.length - 1]]).toEqual([100, 101]);
  });

  it("shorts a rejection at supply and covers at demand", () => {
    const rejected = withBars(supplyBuilt, [97, 100.5, 96.9, 98]);
    expect(signal(supplyDemand, rejected, null, params)).toBe("sell");
    const both = withBars(demandBuilt, [103.8, 104, 100, 102.5]);
    expect(signal(supplyDemand, both, "short", params)).toBe("buy");
    expect(signal(supplyDemand, both, "short", { ...params, exitAt: "break" })).toBe("hold");
  });

  it("only knows a swing pivot once the bars after it have closed", () => {
    const peak = fromCloses([100, 101, 102, 103, 104, 110, 104, 103, 102, 101, 100]);
    const z = getZoneSeries(peak, zoneParamsFrom({ zoneSource: "pivot", pivotStrength: 2, atrPeriod: 2 }));
    expect(Number.isNaN(z.supplyTop[6])).toBe(true);
    expect(z.supplyTop[7]).toBe(111);
  });
});

describe("MACD crossover", () => {
  const K = "12_26_9";
  const bar = (i: number, macd: number, signal: number, extra: Partial<Bar> = {}): Bar =>
    ({ time: i * DAY, open: 100, high: 101, low: 99, close: 100, sma200: 90, [`macd_${K}`]: macd, [`macdSignal_${K}`]: signal, ...extra }) as Bar;

  it("buys a cross above the signal line and exits once MACD is back under it", () => {
    const rule = { rule: "signal" };
    expect(signal(macdCrossover, [bar(0, 1, 2), bar(1, 2.5, 2)], null, rule)).toBe("buy");
    expect(signal(macdCrossover, [bar(0, 2.5, 2), bar(1, 2.6, 2)], null, rule)).toBe("hold");
    // No fresh cross needed to exit, and no strength filter on exits.
    expect(signal(macdCrossover, [bar(0, 1.9, 2), bar(1, 1.8, 2)], "long", { ...rule, minHistogramPct: 0.5 })).toBe("sell");
  });

  it("takes longs only above the 200 SMA and shorts only below it", () => {
    const on = { trendFilter: true };
    expect(signal(macdCrossover, [bar(0, -1, 0), bar(1, 0.5, 0, { sma200: 110 })], null, on)).toBe("hold");
    expect(signal(macdCrossover, [bar(0, -1, 0), bar(1, 0.5, 0, { sma200: 110 })])).toBe("buy");
    expect(signal(macdCrossover, [bar(0, 1, 0), bar(1, -0.5, 0, { sma200: 110 })], null, on)).toBe("sell");
  });

  it("crosses zero by default, ignoring the signal line", () => {
    expect(signal(macdCrossover, [bar(0, 0.2, 0.5), bar(1, 0.4, 0.5)])).toBe("hold");
    expect(signal(macdCrossover, [bar(0, -0.2, 0.5), bar(1, 0.1, 0.5)])).toBe("buy");
    expect(signal(macdCrossover, [bar(0, 0.2, -0.5), bar(1, -0.1, -0.5)], "long")).toBe("sell");
  });

  it("sizes the entry filter as a percent of price", () => {
    expect(signal(macdCrossover, [bar(0, -1, 0), bar(1, 0.05, 0)], null, { minHistogramPct: 0.1 })).toBe("hold");
    expect(signal(macdCrossover, [bar(0, -1, 0), bar(1, 0.2, 0)], null, { minHistogramPct: 0.1 })).toBe("buy");
  });

  it("refuses a fast period that isn't shorter than the slow one", () => {
    expect(signal(macdCrossover, [bar(0, -1, 0), bar(1, 0.5, 0)], null, { fastPeriod: 26, slowPeriod: 26 })).toBe("hold");
  });
});

describe("EMA trend pullback", () => {
  const bar = (i: number, close: number, fast: number, slow: number): Bar =>
    ({ time: i * DAY, open: close, high: close + 1, low: close - 1, close, ema20: fast, ema50: slow }) as Bar;

  it("buys a close back above the fast EMA while it's above the slow one", () => {
    expect(signal(emaPullback, [bar(0, 104, 105, 100), bar(1, 106, 105, 100)])).toBe("buy");
    // Already above the fast EMA: no pullback, no entry.
    expect(signal(emaPullback, [bar(0, 107, 105, 100), bar(1, 108, 105, 100)])).toBe("hold");
    // Fast under slow: no long.
    expect(signal(emaPullback, [bar(0, 94, 95, 100), bar(1, 96, 95, 100)])).toBe("hold");
  });

  it("holds through a dip under the fast EMA and exits when fast crosses below slow", () => {
    expect(signal(emaPullback, [bar(0, 106, 105, 100), bar(1, 101, 104, 100)], "long")).toBe("hold");
    expect(signal(emaPullback, [bar(0, 101, 100.5, 100), bar(1, 98, 99.8, 100)], "long")).toBe("sell");
  });

  it("mirrors it on the short side", () => {
    expect(signal(emaPullback, [bar(0, 96, 95, 100), bar(1, 94, 95, 100)])).toBe("sell");
    expect(signal(emaPullback, [bar(0, 99, 99.8, 100), bar(1, 101, 100.2, 100)], "short")).toBe("buy");
  });

  it("asks the engine for both EMAs", () => {
    const { requiredEMAs } = deriveRequiredIndicators("ema-pullback", [{ fastPeriod: 13, slowPeriod: 34 }]);
    expect(requiredEMAs).toEqual(expect.arrayContaining([13, 34]));
  });
});
