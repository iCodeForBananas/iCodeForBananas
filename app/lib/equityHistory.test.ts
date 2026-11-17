import { describe, expect, it } from "vitest";
import { backtestOverlay, equityHistory, type SnapshotRow } from "./equityHistory";

const T0 = Date.parse("2026-11-09T15:00:00Z");
const HOUR = 3_600_000;
const row = (i: number, equity: number, shares = 0, realized = 0, unrealized = 0): SnapshotRow => ({
  bar_time: new Date(T0 + i * HOUR).toISOString(),
  equity,
  realized_pnl: realized,
  unrealized_pnl: unrealized,
  position_shares: shares,
});

describe("equityHistory", () => {
  // Up to 10,500, down to 9,975 (-5%), back over to 10,600, then down 1% and still under.
  const rows = [
    row(0, 10_000, 0, 50),
    row(1, 10_500, 10, 50, 450),
    row(2, 10_200, 10, 50, 150),
    row(3, 9_975, 0, 25),
    row(4, 10_600, -5, 600, 0),
    row(5, 10_494, -5, 600, -106),
    row(6, 10_494, -5, 600, -106),
  ];
  const h = equityHistory(rows)!;

  it("finds the peak, the deepest drawdown and when it recovered", () => {
    expect(h.peak).toEqual({ time: T0 + 4 * HOUR, value: 10_600 });
    expect(h.maxDrawdown!.pct).toBeCloseTo(5);
    expect(h.maxDrawdown!.dollars).toBe(525);
    expect(h.maxDrawdown!.peakTime).toBe(T0 + HOUR);
    expect(h.maxDrawdown!.troughTime).toBe(T0 + 3 * HOUR);
    expect(h.maxDrawdown!.recoveredAt).toBe(T0 + 4 * HOUR);
  });

  it("lists each period under water, closed or still open", () => {
    expect(h.drawdowns).toHaveLength(2);
    expect(h.drawdowns[0]).toMatchObject({ start: T0 + HOUR, end: T0 + 4 * HOUR, troughTime: T0 + 3 * HOUR });
    expect(h.drawdowns[1]).toMatchObject({ start: T0 + 4 * HOUR, end: null });
    expect(h.drawdowns[1].depthPct).toBeCloseTo(1);
  });

  it("reports the current drawdown and since when", () => {
    expect(h.current.pct).toBeCloseTo(1);
    expect(h.current.dollars).toBe(106);
    expect(h.current.since).toBe(T0 + 4 * HOUR);
  });

  it("reports the position held, since when, its open P&L, and realized P&L", () => {
    expect(h.position).toEqual({ shares: -5, side: "Short", since: T0 + 4 * HOUR, openPnl: -106 });
    expect(h.realizedSinceStart).toBe(550);
    expect(h.realizedTotal).toBe(600);
  });

  it("leaves out shallow dips and handles a flat record", () => {
    const shallow = equityHistory([row(0, 100), row(1, 99.9), row(2, 101)])!;
    expect(shallow.drawdowns).toEqual([]);
    expect(shallow.maxDrawdown!.pct).toBeCloseTo(0.1);
    expect(equityHistory([])).toBeNull();
    const held = equityHistory([row(0, 100, 3), row(1, 101, 3)])!;
    expect(held.position.since).toBeNull(); // held since before the record began
  });
});

describe("backtestOverlay", () => {
  const bt: [number, number][] = [[T0 - 2 * HOUR, 50_000], [T0 - HOUR, 51_000], [T0 + HOUR, 52_020], [T0 + 2 * HOUR, 49_980]];

  it("rescales the backtest to start where the live curve does", () => {
    const o = backtestOverlay(bt, { time: T0, value: 10_000 })!;
    expect(o[0]).toEqual([T0, 10_000]);
    expect(o[1][1]).toBeCloseTo(10_200);
    expect(o[2][1]).toBeCloseTo(9_800);
  });

  it("returns null when the backtest ends before the live record starts", () => {
    expect(backtestOverlay(bt, { time: T0 + 10 * HOUR, value: 10_000 })).toBeNull();
  });
});
