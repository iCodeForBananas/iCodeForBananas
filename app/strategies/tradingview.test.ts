import { describe, expect, it } from "vitest";
import { getDefaultParams, type OHLCBar, type IndicatorValues, type StrategyDefinition } from "./index";
import { atrArray, wmaOf, linregOf, smaOf } from "./ta";
import supertrend, { getSupertrend } from "./supertrend";
import parabolicSar, { getSarDirection } from "./parabolic-sar";
import hullMa, { getHma } from "./hull-ma";
import squeezeMomentum, { getSqueeze } from "./squeeze-momentum";
import moneyFlowIndex, { getMfi } from "./money-flow-index";

type Bar = OHLCBar & IndicatorValues;
const DAY = 864e5;
const bars = (closes: number[], volume = 1000): Bar[] =>
  closes.map((c, i) => ({ time: i * DAY, open: c, high: c + 1, low: c - 1, close: c, volume }));

/** Every action the strategy takes walking the series, tracking its own position. */
function actions(strategy: StrategyDefinition, series: Bar[], params = {}) {
  let position: "long" | "short" | null = null;
  const out: string[] = [];
  for (let index = 0; index < series.length; index++) {
    const a = strategy.handler({ current: series[index], previous: series[index - 1] ?? null, index, series, params: { ...getDefaultParams(strategy.id), ...params }, position }).action;
    if (a === "buy") position = position === "short" ? null : "long";
    if (a === "sell") position = position === "long" ? null : "short";
    out.push(a);
  }
  return out;
}

const upThenDown = [...Array.from({ length: 60 }, (_, i) => 100 + i), ...Array.from({ length: 60 }, (_, i) => 159 - i * 1.5)];

describe("indicator math", () => {
  it("computes SMA, WMA, linear regression and ATR", () => {
    expect(smaOf([1, 2, 3, 4], 2).slice(1)).toEqual([1.5, 2.5, 3.5]);
    expect(wmaOf([1, 2, 3], 3)[2]).toBeCloseTo((1 + 4 + 9) / 6);
    expect(linregOf([1, 3, 5, 7], 4)[3]).toBeCloseTo(7);
    expect(atrArray(bars([10, 10, 10]), 2)[2]).toBeCloseTo(2);
  });
});

describe("trend strategies flip with the market", () => {
  for (const [s, dir] of [
    [supertrend, (x: Bar[]) => getSupertrend(x, 10, 3).dir],
    [parabolicSar, (x: Bar[]) => getSarDirection(x, 0.02, 0.2)],
  ] as const) {
    it(`${s.id} is up in the rise and down in the fall`, () => {
      const series = bars(upThenDown);
      const d = dir(series);
      expect(d[55]).toBe(1);
      expect(d[115]).toBe(-1);
      expect(actions(s, series)).toContain("sell");
    });
  }

  it("Hull MA rises then falls, and sells the turn", () => {
    const series = bars(upThenDown);
    const h = getHma(series, 21);
    expect(h[50]).toBeGreaterThan(h[49]);
    expect(h[110]).toBeLessThan(h[109]);
    const acts = actions(hullMa, series, { length: 21 });
    expect(acts.indexOf("sell")).toBeGreaterThan(59);
  });
});

describe("squeeze momentum", () => {
  it("fires out of a quiet range into a breakout and buys", () => {
    // Wide swings, then a tight range (squeeze on), then a steady climb.
    const closes = [
      ...Array.from({ length: 40 }, (_, i) => 100 + (i % 2 ? 6 : -6)),
      ...Array.from({ length: 30 }, (_, i) => 100 + (i % 2 ? 0.2 : -0.2)),
      ...Array.from({ length: 20 }, (_, i) => 100 + i * 2),
    ];
    const series = closes.map((c, i) => ({ time: i * DAY, open: c, high: c + 0.3, low: c - 0.3, close: c }));
    const { on } = getSqueeze(series, 20, 2, 1.5);
    expect(on.slice(60, 70)).toContain(1);
    expect(actions(squeezeMomentum, series).slice(70)).toContain("buy");
  });
});

describe("money flow index", () => {
  it("weights flow by volume, and needs volume", () => {
    const series = bars([10, 11, 10, 11], 100);
    series[1].volume = 300;
    const mfi = getMfi(series, 3);
    // Up flow 11*300 + 11*100, down flow 10*100.
    expect(mfi[3]).toBeCloseTo(100 - 100 / (1 + 4400 / 1000));
    expect(getMfi(series.map((b) => ({ ...b, volume: undefined })), 3)[3]).toBeNaN();
  });

  it("buys the turn up out of oversold", () => {
    const series = bars([...Array.from({ length: 20 }, (_, i) => 100 - i), 82, 84, 86, 88]);
    expect(actions(moneyFlowIndex, series, { trendFilter: false }).slice(20)).toContain("buy");
  });
});
