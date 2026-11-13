import { describe, expect, it } from "vitest";
import { backtestReference, correlations, liveRiskSettings, parsePriceCsv } from "./backtestReference";
import { deploymentDetails } from "./deploymentDetails";

const DAY = 86_400_000;

describe("parsePriceCsv", () => {
  it("reads rows oldest first and drops unusable ones", () => {
    const csv = [
      "Date,Open,High,Low,Close,Volume",
      "2026-01-03T14:30:00.000Z,10,11,9,10.5,100",
      "2026-01-02T14:30:00.000Z,9,10,8,9.5,100",
      "2026-01-05T14:30:00.000Z,0,11,9,10.5,100",
      "not a date,1,1,1,1,1",
      "",
    ].join("\r\n");
    const bars = parsePriceCsv(csv);
    expect(bars.map((b) => b.close)).toEqual([9.5, 10.5]);
    expect(bars[0].time).toBe(Date.parse("2026-01-02T14:30:00.000Z"));
  });
});

describe("liveRiskSettings", () => {
  it("matches the live runtime: all in, whole shares, no stop, no reversal, 25% limit with a 20-bar pause", () => {
    const r = liveRiskSettings();
    expect(r.positionSizePercent).toBe(100);
    expect(r.sizing).toMatchObject({ mode: "fixed", useStopLoss: false, useTakeProfit: false, wholeShares: true, allowReversal: false, maxDrawdownPercent: 25, drawdownPauseBars: 20 });
  });
});

describe("backtestReference", () => {
  // A steady zigzag, so IBS mean reversion trades.
  const bars = Array.from({ length: 400 }, (_, i) => {
    const base = 100 + 10 * Math.sin(i / 5);
    const close = i % 2 === 0 ? base - 0.8 : base + 0.8;
    return { time: Date.UTC(2025, 0, 1) + i * DAY, open: base, high: base + 1, low: base - 1, close };
  });

  it("runs the strategy with the deployment's own values and reports the span", () => {
    const ref = backtestReference(bars, { strategyId: "ibs-mean-reversion", values: { entryIbs: 20, exitIbs: 80, trendFilter: false }, shorts: true, dataset: "X-1d.csv", live: [] })!;
    expect(ref.trades).toBeGreaterThan(10);
    expect(ref.years).toBeCloseTo(399 / 365.25, 1);
    expect(ref.dataset).toBe("X-1d.csv");
    expect(ref.sameWindow).toBeNull();
    expect(ref.dailyReturns.length).toBeGreaterThan(300);
  });

  it("compares backtest and live over the stretch both cover", () => {
    const start = bars[350].time;
    const live: [number, number][] = [[start, 10_000], [bars[360].time, 10_200], [bars[399].time + 5 * DAY, 10_500]];
    const ref = backtestReference(bars, { strategyId: "ibs-mean-reversion", values: { entryIbs: 20, exitIbs: 80, trendFilter: false }, shorts: true, dataset: "X", live })!;
    // The data ends before the live record does, so the window stops at the data.
    expect(ref.sameWindow).not.toBeNull();
    expect(ref.sameWindow!.livePct).toBeCloseTo(2, 5);
    expect(ref.sameWindow!.to).toBe(ref.to);
    expect(typeof ref.sameWindow!.backtestInTradeAtStart).toBe("boolean");
  });

  it("returns null for a strategy it doesn't know", () => {
    expect(backtestReference(bars, { strategyId: "gone", values: {}, shorts: true, dataset: "X", live: [] })).toBeNull();
  });
});

describe("correlations", () => {
  const days = Array.from({ length: 80 }, (_, i) => `2026-01-${String(i).padStart(3, "0")}`);
  const noise = days.map((_, i) => Math.sin(i * 1.7) + Math.cos(i * 0.3));

  it("finds identical series, mirror images, and skips short overlaps", () => {
    const series = new Map<string, [string, number][]>([
      ["a", days.map((d, i) => [d, noise[i]])],
      ["b", days.map((d, i) => [d, noise[i] * 2])],
      ["c", days.map((d, i) => [d, -noise[i]])],
      ["short", days.slice(0, 30).map((d, i) => [d, noise[i]])],
    ]);
    const out = correlations(series);
    const pair = (x: string, y: string) => out.find((c) => (c.a === x && c.b === y) || (c.a === y && c.b === x));
    expect(pair("a", "b")!.r).toBeCloseTo(1);
    expect(pair("a", "c")!.r).toBeCloseTo(-1);
    expect(pair("a", "short")).toBeUndefined();
    expect(pair("a", "b")!.days).toBe(80);
  });
});

describe("deploymentDetails values", () => {
  it("decodes raw parameter values from the id", () => {
    const d = deploymentDetails({ id: "ibs-mean-reversion-avgo-1h-35-75-n-ls", strategyId: "ibs-mean-reversion", symbol: "AVGO", interval: "1h" });
    expect(d.values).toEqual({ entryIbs: 35, exitIbs: 75, trendFilter: false });
    expect(deploymentDetails({ id: "x", strategyId: "gone", symbol: "A", interval: "1d" }).values).toEqual({});
  });
});
