import { describe, expect, it } from "vitest";
import { getDefaultParams, type OHLCBar, type IndicatorValues, type StrategyDefinition } from "./index";
import { nyClock, sessionInfo, isFlattenBar } from "./session";
import { sessionVwap, relativeVolume, openingRelativeVolume, onBalanceVolume } from "./volume";
import { patternShape, detectPattern } from "./candle-patterns";
import orb, { openingRange } from "./opening-range-breakout";
import intradayMomentum from "./intraday-momentum";
import vwapTrend from "./vwap-trend";
import candlestickPatterns from "./candlestick-patterns";
import { parsePriceCsv } from "@/app/lib/backtestReference";

const HOUR = 60 * 60 * 1000;

/** Hourly regular-session bars (9:30 ... 15:30 ET) for a winter day, from closes. */
function hourlyDay(dateUtc: number, closes: number[], volume = 1000): OHLCBar[] {
  // 14:30 UTC is 9:30 ET in standard time.
  return closes.map((close, i) => ({ time: dateUtc + 14.5 * HOUR + i * HOUR, open: close, high: close + 0.5, low: close - 0.5, close, volume }));
}

function run(strategy: StrategyDefinition, series: OHLCBar[], index: number, position: "long" | "short" | null = null, params = {}) {
  return strategy.handler({
    current: series[index] as OHLCBar & IndicatorValues,
    previous: (series[index - 1] ?? null) as (OHLCBar & IndicatorValues) | null,
    index,
    series: series as (OHLCBar & IndicatorValues)[],
    params: { ...getDefaultParams(strategy.id), ...params },
    position,
  }).action;
}

const D1 = Date.UTC(2025, 0, 6);
const D2 = Date.UTC(2025, 0, 7);

describe("session clock", () => {
  it("reads New York time across daylight saving", () => {
    expect(nyClock(Date.UTC(2025, 0, 6, 14, 30)).minute).toBe(9 * 60 + 30);
    expect(nyClock(Date.UTC(2025, 6, 7, 13, 30)).minute).toBe(9 * 60 + 30);
  });

  it("numbers session bars and flattens on the bar before the last", () => {
    const s = hourlyDay(D1, [1, 2, 3, 4, 5, 6, 7]);
    const info = sessionInfo(s);
    expect(info.sessionBar).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(s.map((_, i) => isFlattenBar(info, i))).toEqual([false, false, false, false, false, true, true]);
  });
});

describe("volume", () => {
  it("weights VWAP by volume and resets each session", () => {
    const s: OHLCBar[] = [
      { time: D1 + 14.5 * HOUR, open: 10, high: 10, low: 10, close: 10, volume: 100 },
      { time: D1 + 15.5 * HOUR, open: 20, high: 20, low: 20, close: 20, volume: 300 },
      { time: D2 + 14.5 * HOUR, open: 50, high: 50, low: 50, close: 50, volume: 1 },
    ];
    expect(sessionVwap(s)).toEqual([10, 17.5, 50]);
  });

  it("measures relative volume, OBV, and gives NaN without volume", () => {
    const s = hourlyDay(D1, [1, 2, 1, 3]).map((b, i) => ({ ...b, volume: i === 3 ? 400 : 100 }));
    expect(relativeVolume(s, 3, 3)).toBe(4);
    expect(onBalanceVolume(s)).toEqual([0, 100, 0, 400]);
    const noVol = s.map((b) => ({ ...b, volume: undefined }));
    expect(relativeVolume(noVol, 3, 3)).toBeNaN();
    expect(sessionVwap(noVol).every(Number.isNaN)).toBe(true);
  });

  it("compares the opening bar with prior sessions' opening bars", () => {
    const s = [...hourlyDay(D1, [1, 1], 100), ...hourlyDay(D2, [1, 1], 300)];
    expect(openingRelativeVolume(s, 3, 1)).toBe(3);
  });

  it("parses the CSV volume column", () => {
    const bars = parsePriceCsv("Date,Open,High,Low,Close,Volume\n2025-01-06T14:30:00.000Z,1,2,0.5,1.5,1234\n");
    expect(bars[0].volume).toBe(1234);
  });
});

describe("opening range breakout", () => {
  it("finds the range only once its bars have closed", () => {
    const s = hourlyDay(D1, [10, 11, 12]);
    expect(openingRange(s, 0, 0, 2)).toBeNull();
    expect(openingRange(s, 0, 1, 2)).toEqual({ high: 11.5, low: 9.5 });
  });

  it("buys the first close above the first hour, once a session, and goes flat by the close", () => {
    const s = hourlyDay(D1, [100, 102, 103, 103, 103, 103, 103]);
    expect(run(orb, s, 1)).toBe("buy");
    expect(run(orb, s, 2)).toBe("hold"); // already broke out this session
    expect(run(orb, s, 3, "long")).toBe("hold");
    expect(run(orb, s, 5, "long")).toBe("sell");
  });

  it("shorts the low and never trades daily bars", () => {
    const s = hourlyDay(D1, [100, 98, 98, 98, 98, 98, 98]);
    expect(run(orb, s, 1)).toBe("sell");
    const daily: OHLCBar[] = [0, 1, 2].map((i) => ({ time: D1 + i * 24 * HOUR, open: 1, high: 2, low: 0.5, close: 1 + i }));
    expect(run(orb, daily, 2)).toBe("hold");
  });
});

describe("intraday momentum", () => {
  it("trades the morning's direction into the close", () => {
    const s = [...hourlyDay(D1, [100, 100, 100, 100, 100, 100, 100]), ...hourlyDay(D2, [101, 101, 101, 101, 101, 101, 101])];
    const d2 = 7;
    expect(run(intradayMomentum, s, d2 + 3)).toBe("hold"); // too early
    expect(run(intradayMomentum, s, d2 + 4)).toBe("buy"); // 13:30 bar, fills at the 14:30 open
    expect(run(intradayMomentum, s, d2 + 5, "long")).toBe("sell");
  });
});

describe("VWAP trend", () => {
  it("goes with the side of VWAP after the opening bar", () => {
    const s = hourlyDay(D1, [100, 102, 99, 99, 99, 99, 99]);
    expect(run(vwapTrend, s, 0)).toBe("hold");
    expect(run(vwapTrend, s, 1)).toBe("buy");
    expect(run(vwapTrend, s, 2, "long")).toBe("sell");
  });
});

describe("candlestick patterns", () => {
  // Ten falling bars with 1-point bodies set the context and average body.
  const decline: OHLCBar[] = Array.from({ length: 10 }, (_, i) => ({ time: i, open: 120 - i * 2, high: 120.5 - i * 2, low: 118.5 - i * 2, close: 119 - i * 2 }));
  const last = decline[decline.length - 1];

  it("spots a bullish engulfing after a decline, not after a rise", () => {
    const bear: OHLCBar = { time: 10, open: last.close, high: last.close + 0.2, low: last.close - 2.2, close: last.close - 2 };
    const bull: OHLCBar = { time: 11, open: bear.close - 0.2, high: last.close + 1.2, low: bear.close - 0.4, close: last.close + 1 };
    const s = [...decline, bear, bull];
    expect(patternShape(s, s.length - 1, "engulfing")).toBe(1);
    expect(detectPattern(s, s.length - 1, "engulfing", 5)).toBe(1);
    const rising = s.map((b, i) => (i < 10 ? { ...b, close: 50 + i, open: 49 + i } : b));
    expect(detectPattern(rising, s.length - 1, "engulfing", 5)).toBe(0);
  });

  it("spots a hammer and a shooting star by their shadows", () => {
    const hammer: OHLCBar = { time: 10, open: 100, high: 100.6, low: 96, close: 100.5 };
    const star: OHLCBar = { time: 10, open: 100, high: 104, low: 99.9, close: 99.6 };
    expect(patternShape([hammer], 0, "hammer")).toBe(1);
    expect(patternShape([star], 0, "hammer")).toBe(-1);
  });

  it("spots a morning star", () => {
    const big: OHLCBar = { time: 10, open: last.close, high: last.close + 0.1, low: last.close - 4.1, close: last.close - 4 };
    const starBar: OHLCBar = { time: 11, open: big.close - 0.5, high: big.close, low: big.close - 1, close: big.close - 0.4 };
    const up: OHLCBar = { time: 12, open: big.close, high: last.close, low: big.close - 0.1, close: last.close - 1 };
    const s = [...decline, big, starBar, up];
    expect(detectPattern(s, s.length - 1, "star", 5)).toBe(1);
  });

  it("buys a pattern, holds, then exits after the hold window", () => {
    const hammer: OHLCBar = { time: 10, open: last.close - 1, high: last.close - 0.4, low: last.close - 5, close: last.close - 0.5 };
    const s = [...decline, hammer];
    expect(run(candlestickPatterns, s, s.length - 1, null, { pattern: "hammer" })).toBe("buy");
    const flat = Array.from({ length: 5 }, (_, i) => ({ time: 11 + i, open: 100, high: 100.2, low: 99.8, close: 100 }));
    const later = [...s, ...flat];
    expect(run(candlestickPatterns, later, s.length + 3, "long", { pattern: "hammer", holdBars: 5 })).toBe("hold");
    expect(run(candlestickPatterns, later, s.length + 4, "long", { pattern: "hammer", holdBars: 5 })).toBe("sell");
  });
});
