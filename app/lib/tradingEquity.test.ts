import { describe, expect, it } from "vitest";
import { formatAge, maxDrawdownPct, mergeCurves, niceScale, strategyName, summarize, type EquityCurveRow } from "./tradingEquity";

const T0 = Date.UTC(2026, 10, 9, 15, 0);
const row = (over: Partial<EquityCurveRow> = {}): EquityCurveRow => ({
  deployment_id: "ibs-qqq",
  strategy_id: "ibs-mean-reversion",
  symbol: "QQQ",
  bar_interval: "15min",
  starting_at: new Date(T0).toISOString(),
  starting_equity: 12_000,
  starting_trades_closed: 2,
  starting_winning_trades: 1,
  latest_at: new Date(T0 + 7_200_000).toISOString(),
  position_shares: -5,
  trades_closed: 6,
  winning_trades: 4,
  points: [
    [T0, 12_000],
    [T0 + 3_600_000, 13_200],
    [T0 + 7_200_000, 12_600],
  ],
  ...over,
});

describe("summarize", () => {
  it("scales the real equity so the curve starts at exactly $10,000", () => {
    const s = summarize(row());
    expect(s.points).toEqual([
      [T0, 10_000],
      [T0 + 3_600_000, 11_000],
      [T0 + 7_200_000, 10_500],
    ]);
    expect(s.value).toBe(10_500);
    expect(s.returnPct).toBeCloseTo(5);
  });

  it("starts at $10,000 even when thinning removed the first report", () => {
    const s = summarize(row({ points: [[T0 + 3_600_000, 13_200]] }));
    expect(s.points[0]).toEqual([T0, 10_000]);
    expect(s.points).toHaveLength(2);
  });

  it("gives a deployment with one report a flat $10,000", () => {
    const s = summarize(row({ points: [[T0, 12_000]] }));
    expect(s.points).toEqual([[T0, 10_000]]);
    expect(s.returnPct).toBe(0);
  });

  it("counts trades since the first report, and names the side and bar size", () => {
    const s = summarize(row());
    expect(s.trades).toBe(4);
    expect(s.wins).toBe(3);
    expect(s.position).toBe("Short");
    expect(s.label).toBe("QQQ 15m");
    expect(summarize(row({ position_shares: 3 })).position).toBe("Long");
    expect(summarize(row({ position_shares: 0 })).position).toBe("Flat");
  });
});

describe("maxDrawdownPct", () => {
  it("is the largest fall from a prior peak", () => {
    expect(maxDrawdownPct([[0, 100], [1, 120], [2, 90], [3, 150], [4, 135]])).toBeCloseTo(25);
  });
  it("is zero for a curve that only rises", () => {
    expect(maxDrawdownPct([[0, 100], [1, 110]])).toBe(0);
  });
});

describe("mergeCurves", () => {
  it("holds each deployment's last value between its reports and omits it before its first", () => {
    const merged = mergeCurves([
      { id: "a", points: [[10, 1], [30, 3]] },
      { id: "b", points: [[20, 5]] },
    ]);
    expect(merged).toEqual([
      { t: 10, a: 1 },
      { t: 20, a: 1, b: 5 },
      { t: 30, a: 3, b: 5 },
    ]);
  });
});

describe("niceScale", () => {
  it("contains every value on round ticks", () => {
    const { domain, ticks } = niceScale([9_873, 10_000, 11_240]);
    expect(domain[0]).toBeLessThanOrEqual(9_873);
    expect(domain[1]).toBeGreaterThanOrEqual(11_240);
    expect(ticks).toEqual([9_500, 10_000, 10_500, 11_000, 11_500]);
  });
  it("survives a completely flat curve", () => {
    const { domain, ticks } = niceScale([10_000, 10_000]);
    expect(domain[0]).toBeLessThanOrEqual(10_000);
    expect(domain[1]).toBeGreaterThanOrEqual(10_000);
    expect(ticks.length).toBeGreaterThan(0);
  });
});

describe("labels", () => {
  it("capitalizes strategy ids and their acronyms", () => {
    expect(strategyName("ibs-mean-reversion")).toBe("IBS mean reversion");
    expect(strategyName("ema-price-cross")).toBe("EMA price cross");
  });
  it("formats ages coarsely", () => {
    expect(formatAge(30_000)).toBe("just now");
    expect(formatAge(12 * 60_000)).toBe("12m ago");
    expect(formatAge(3 * 3_600_000)).toBe("3h ago");
    expect(formatAge(2 * 86_400_000)).toBe("2d ago");
  });
});
