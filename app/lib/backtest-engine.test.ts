import { describe, expect, it } from "vitest";
import { runBacktestWithParams } from "./backtest-engine";
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
