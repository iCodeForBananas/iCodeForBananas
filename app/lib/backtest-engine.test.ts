import { describe, expect, it } from "vitest";
import { generateCombinations, MAX_BATCH_RUNS, runBacktestWithParams } from "./backtest-engine";
import type { IndicatorData } from "@/app/types";
import type { StrategyDefinition } from "@/app/strategies";

const DAY = 24 * 60 * 60 * 1000;

type Bar = [open: number, high: number, low: number, close: number];

function bars(rows: Bar[]): IndicatorData[] {
  return rows.map(([open, high, low, close], i) => ({ time: i * DAY, open, high, low, close }));
}

/** Emits a fixed action on given bar indices, holds otherwise. */
function scripted(signals: Record<number, "buy" | "sell">): StrategyDefinition {
  return {
    id: "scripted",
    name: "Scripted",
    description: "test",
    handler: ({ index }) => ({ action: signals[index] ?? "hold", reason: `signal@${index}` }),
  };
}

const run = (
  data: IndicatorData[],
  signals: Record<number, "buy" | "sell">,
  risk: Partial<{ stopLossPercent: number; takeProfitPercent: number; positionSizePercent: number; commissionBps: number; slippageBps: number }> = {},
  enableShorts = false,
) =>
  runBacktestWithParams(
    data,
    scripted(signals),
    {},
    10_000,
    { stopLossPercent: 0, takeProfitPercent: 0, ...risk },
    enableShorts,
  );

describe("stop loss / take profit", () => {
  it("fills a stop at the level when the bar trades through it", () => {
    const r = run(bars([[100, 100, 100, 100], [100, 100, 100, 100], [99.5, 99.8, 97, 98]]), { 1: "buy" }, { stopLossPercent: 1 });
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0].exitPrice).toBeCloseTo(99);
    expect(r.trades[0].reason).toMatch(/^Stop loss hit/);
  });

  it("fills a stop at the open when the bar gaps through it", () => {
    const r = run(bars([[100, 100, 100, 100], [100, 100, 100, 100], [95, 96, 94, 95]]), { 1: "buy" }, { stopLossPercent: 1 });
    expect(r.trades[0].exitPrice).toBeCloseTo(95);
    expect(r.trades[0].reason).toMatch(/gapped through/);
  });

  it("fills a take profit at the open on a favorable gap", () => {
    const r = run(bars([[100, 100, 100, 100], [100, 100, 100, 100], [110, 111, 109, 110]]), { 1: "buy" }, { takeProfitPercent: 5 });
    expect(r.trades[0].exitPrice).toBeCloseTo(110);
  });

  it("mirrors levels for shorts", () => {
    const r = run(bars([[100, 100, 100, 100], [100, 100, 100, 100], [100.5, 102, 100, 101]]), { 1: "sell" }, { stopLossPercent: 1 }, true);
    expect(r.trades[0].side).toBe("SHORT");
    expect(r.trades[0].exitPrice).toBeCloseTo(101);
  });

  it("sets the stop off the slipped fill, not the raw close", () => {
    // 100 bps slippage: buy fills at 101, so a 1% stop sits at 99.99.
    const r = run(bars([[100, 100, 100, 100], [100, 100, 100, 100], [100.5, 100.5, 99.98, 100]]), { 1: "buy" }, { stopLossPercent: 1, slippageBps: 100 });
    expect(r.trades[0].entryPrice).toBeCloseTo(101);
    expect(r.trades[0].reason).toMatch(/^Stop loss hit at 99\.99/);
  });

  it("does not re-enter on the bar a stop fired", () => {
    const r = run(bars([[100, 100, 100, 100], [100, 100, 100, 100], [99, 99, 97, 98], [98, 98, 98, 98]]), { 1: "buy", 2: "buy" }, { stopLossPercent: 1 });
    expect(r.trades).toHaveLength(1);
  });
});

describe("costs and sizing", () => {
  it("charges both commissions to the trade and to equity exactly once", () => {
    // 50% of 10,000 at 100 = 50 shares. 10 bps each side.
    const r = run(bars([[100, 100, 100, 100], [100, 100, 100, 100], [110, 110, 110, 110]]), { 1: "buy", 2: "sell" }, { positionSizePercent: 50, commissionBps: 10 });
    const entryCommission = 5_000 * 0.001;
    const exitCommission = 5_500 * 0.001;
    expect(r.trades[0].pnl).toBeCloseTo(500 - entryCommission - exitCommission);
    expect(r.totalPnl).toBeCloseTo(r.trades[0].pnl);
  });
});

describe("position passed to the strategy", () => {
  it("tells the handler what is open going into each bar", () => {
    const seen: (string | null | undefined)[] = [];
    const strategy: StrategyDefinition = {
      id: "watcher",
      name: "Watcher",
      description: "test",
      handler: ({ index, position }) => {
        seen[index] = position;
        return { action: index === 1 ? "buy" : index === 3 ? "sell" : "hold", reason: "" };
      },
    };
    runBacktestWithParams(bars(Array(5).fill([100, 100, 100, 100])), strategy, {}, 10_000, { stopLossPercent: 0, takeProfitPercent: 0 });
    expect(seen.slice(1)).toEqual([null, "long", "long", null]);
  });

  it("lets a long-only exit close a long without opening a short when flat", () => {
    // Sells only while long, the way Alligator's mouth-closing exit does.
    const strategy: StrategyDefinition = {
      id: "exit-only",
      name: "Exit only",
      description: "test",
      handler: ({ index, position }) =>
        index === 1 ? { action: "buy", reason: "" } : position === "long" ? { action: "sell", reason: "exit" } : { action: "hold", reason: "" },
    };
    const r = runBacktestWithParams(bars(Array(5).fill([100, 100, 100, 100])), strategy, {}, 10_000, { stopLossPercent: 0, takeProfitPercent: 0 }, true);
    expect(r.trades.map((t) => [t.side, t.reason])).toEqual([["LONG", "exit"]]);
  });
});

describe("equity curve and metrics", () => {
  it("marks open positions to market, so drawdown sees open-trade losses", () => {
    const r = run(bars([[100, 100, 100, 100], [100, 100, 100, 100], [80, 80, 80, 80], [100, 100, 100, 100]]), { 1: "buy", 3: "sell" });
    expect(r.totalPnl).toBeCloseTo(0);
    expect(r.maxDrawdownPercent).toBeCloseTo(20);
  });

  it("annualizes Sharpe by the data's bar frequency", () => {
    const rows: Bar[] = [[100, 100, 100, 100]];
    for (let i = 1; i < 40; i++) {
      const c = 100 + i + (i % 2 ? 0.5 : 0);
      rows.push([c, c, c, c]);
    }
    const daily = run(bars(rows), { 1: "buy" });
    const hourlyData = bars(rows).map((b, i) => ({ ...b, time: i * (DAY / 24) }));
    const hourly = run(hourlyData, { 1: "buy" });
    expect(hourly.sharpeRatio / daily.sharpeRatio).toBeCloseTo(Math.sqrt(24), 1);
  });
});

describe("parameter sweep", () => {
  const values = (combos: Record<string, unknown>[], key: string) => [...new Set(combos.map((c) => c[key]))];

  it("runs the full grid when it fits", () => {
    const combos = generateCombinations([
      { key: "a", min: 1, max: 5, step: 1 },
      { key: "b", min: 10, max: 30, step: 10 },
    ]);
    expect(combos).toHaveLength(15);
  });

  it("spreads an oversized grid across every parameter's range instead of pinning the first ones", () => {
    // Momentum (ROC)'s default ranges: 24 × 41 × 31 × 21 combinations.
    const combos = generateCombinations([
      { key: "rocPeriod", min: 5, max: 120, step: 5 },
      { key: "entryThreshold", min: 0, max: 20, step: 0.5 },
      { key: "exitThreshold", min: -10, max: 5, step: 0.5 },
      { key: "smoothing", min: 0, max: 20, step: 1 },
    ]);
    expect(combos.length).toBeLessThanOrEqual(MAX_BATCH_RUNS);
    for (const key of ["rocPeriod", "entryThreshold", "exitThreshold", "smoothing"]) {
      expect(values(combos, key).length).toBeGreaterThan(1);
    }
    expect(values(combos, "rocPeriod")).toContain(5);
    expect(values(combos, "rocPeriod")).toContain(120);
  });

  it("keeps a fixed parameter fixed", () => {
    const combos = generateCombinations([
      { key: "fixed", min: 7, max: 7, step: 1 },
      { key: "wide", min: 1, max: 200, step: 1 },
    ]);
    expect(values(combos, "fixed")).toEqual([7]);
    expect(combos).toHaveLength(MAX_BATCH_RUNS);
  });
});
