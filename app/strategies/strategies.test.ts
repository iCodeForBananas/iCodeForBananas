import { describe, expect, it } from "vitest";
import { getDefaultParams, type OHLCBar, type IndicatorValues, type StrategyDefinition } from "./index";
import ibsMeanReversion, { ibs } from "./ibs-mean-reversion";
import double7s from "./double-7s";
import cumulativeRsi, { getRsiArray, cumulativeRsiAt } from "./cumulative-rsi";
import turtle, { priorChannel } from "./turtle";
import faberTrend from "./faber-trend";
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

  it("never sells while flat, so it can't open a short", () => {
    const nearHigh: Bar = { time: 0, open: 101, high: 110, low: 100, close: 109 };
    expect(signal(ibsMeanReversion, [nearHigh], null)).toBe("hold");
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
