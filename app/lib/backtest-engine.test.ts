import { describe, expect, it } from "vitest";
import { generateCombinations, LEGACY_SIZING, MAX_BATCH_RUNS, positionCapPercent, runBacktestWithParams, type SizingSettings } from "./backtest-engine";
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
    const r = run(bars([[100, 100, 100, 100], [100, 100, 100, 100], [100, 100, 100, 100], [99.5, 99.8, 97, 98]]), { 1: "buy" }, { stopLossPercent: 1 });
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0].exitPrice).toBeCloseTo(99);
    expect(r.trades[0].reason).toMatch(/^Stop loss hit/);
  });

  it("fills a stop at the open when the bar gaps through it", () => {
    const r = run(bars([[100, 100, 100, 100], [100, 100, 100, 100], [100, 100, 100, 100], [95, 96, 94, 95]]), { 1: "buy" }, { stopLossPercent: 1 });
    expect(r.trades[0].exitPrice).toBeCloseTo(95);
    expect(r.trades[0].reason).toMatch(/gapped through/);
  });

  it("fills a take profit at the open on a favorable gap", () => {
    const r = run(bars([[100, 100, 100, 100], [100, 100, 100, 100], [100, 100, 100, 100], [110, 111, 109, 110]]), { 1: "buy" }, { takeProfitPercent: 5 });
    expect(r.trades[0].exitPrice).toBeCloseTo(110);
  });

  it("mirrors levels for shorts", () => {
    const r = run(bars([[100, 100, 100, 100], [100, 100, 100, 100], [100, 100, 100, 100], [100.5, 102, 100, 101]]), { 1: "sell" }, { stopLossPercent: 1 }, true);
    expect(r.trades[0].side).toBe("SHORT");
    expect(r.trades[0].exitPrice).toBeCloseTo(101);
  });

  it("sets the stop off the slipped fill, not the raw close", () => {
    // 100 bps slippage: buy fills at 101, so a 1% stop sits at 99.99.
    const r = run(bars([[100, 100, 100, 100], [100, 100, 100, 100], [100, 100, 100, 100], [100.5, 100.5, 99.98, 100]]), { 1: "buy" }, { stopLossPercent: 1, slippageBps: 100 });
    expect(r.trades[0].entryPrice).toBeCloseTo(101);
    expect(r.trades[0].reason).toMatch(/^Stop loss hit at 99\.99/);
  });

  it("does not re-enter on the bar a stop fired", () => {
    const r = run(bars([[100, 100, 100, 100], [100, 100, 100, 100], [100, 100, 100, 100], [99, 99, 97, 98], [98, 98, 98, 98]]), { 1: "buy", 2: "buy" }, { stopLossPercent: 1 });
    expect(r.trades).toHaveLength(1);
  });
});

describe("costs and sizing", () => {
  it("charges both commissions to the trade and to equity exactly once", () => {
    // 50% of 10,000 at 100 = 50 shares. 10 bps each side.
    const r = run(bars([[100, 100, 100, 100], [100, 100, 100, 100], [100, 100, 100, 100], [110, 110, 110, 110]]), { 1: "buy", 2: "sell" }, { positionSizePercent: 50, commissionBps: 10 });
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
    const r = run(bars([[100, 100, 100, 100], [100, 100, 100, 100], [100, 100, 100, 100], [80, 80, 80, 80], [100, 100, 100, 100]]), { 1: "buy", 3: "sell" });
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

describe("risk-based sizing and account protection", () => {
  const flat = (n: number, price = 100): Bar[] => Array(n).fill([price, price, price, price]);
  const sized = (
    data: IndicatorData[],
    signals: Record<number, "buy" | "sell">,
    sizing: Partial<SizingSettings>,
    risk: { stopLossPercent?: number; positionSizePercent?: number } = {},
  ) =>
    runBacktestWithParams(data, scripted(signals), {}, 10_000, {
      stopLossPercent: risk.stopLossPercent ?? 0,
      takeProfitPercent: 0,
      positionSizePercent: risk.positionSizePercent ?? 100,
      sizing: { ...LEGACY_SIZING, ...sizing },
    });

  it("sizes so a stop fill loses exactly the risk %, whatever the stop distance", () => {
    // 1% of 10,000 at risk over a 5% stop: a $2,000 position, 20 shares.
    const r = sized(bars([...flat(3), [99, 99, 94, 95]]), { 1: "buy" }, { mode: "risk", riskPercent: 1 }, { stopLossPercent: 5 });
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0].reason).toContain("Stop loss hit");
    expect(r.trades[0].pnl).toBeCloseTo(-100);
  });

  it("puts an ATR stop the given multiple of the entry bar's ATR away", () => {
    // ATR 2 × 2 = a stop 4 below 100: $100 at risk / $4 = 25 shares.
    const data = bars([...flat(3), [99, 99, 95, 96]]).map((d) => ({ ...d, atr: 2 }));
    const r = sized(data, { 1: "buy" }, { mode: "risk", riskPercent: 1, atrStopMultiple: 2 });
    expect(r.trades[0].exitPrice).toBeCloseTo(96);
    expect(r.trades[0].pnl).toBeCloseTo(-100);
  });

  it("never sizes past the position cap, however tight the stop", () => {
    // 1% risk over a 0.5% stop would want 200% of the account.
    const r = sized(bars([...flat(3), [110, 110, 110, 110]]), { 1: "buy", 2: "sell" }, { mode: "risk", riskPercent: 1 }, { stopLossPercent: 0.5 });
    expect(r.trades[0].pnl).toBeCloseTo(1000); // 100 shares × $10: all in, no more
  });

  it("takes no trade in risk mode when there's no stop to size from", () => {
    const r = sized(bars(flat(4)), { 1: "buy" }, { mode: "risk" });
    expect(r.trades).toHaveLength(0);
  });

  it("with the stop off, risk mode goes all in and exits only on the strategy's signal", () => {
    // A 1% stop and a 2 × ATR stop are both set, and both are ignored: the
    // 10% drop on bar 3 doesn't stop it out; the sell on bar 3 closes it at
    // bar 4's open.
    const data = bars([...flat(3), [90, 90, 90, 90], [95, 95, 95, 95]]).map((d) => ({ ...d, atr: 1 }));
    const r = sized(data, { 1: "buy", 3: "sell" }, { mode: "risk", riskPercent: 1, atrStopMultiple: 2, useStopLoss: false, maxGapLossPercent: 10 }, { stopLossPercent: 1 });
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0].exitTime).toBe(4 * DAY);
    expect(r.trades[0].pnl).toBeCloseTo(-500); // 100 shares: 100% of 10,000, no gap cap
  });

  it("with the stop off, fixed mode keeps its own size", () => {
    const r = sized(bars([...flat(3), [90, 90, 90, 90]]), { 1: "buy", 2: "sell" }, { useStopLoss: false }, { stopLossPercent: 1, positionSizePercent: 40 });
    expect(r.trades[0].pnl).toBeCloseTo(-400);
  });

  it("ignores the take profit percent when take profit is off", () => {
    const data = bars([...flat(3), [120, 120, 120, 120], [100, 100, 100, 100]]);
    const on = runBacktestWithParams(data, scripted({ 1: "buy", 3: "sell" }), {}, 10_000, { stopLossPercent: 0, takeProfitPercent: 5, sizing: LEGACY_SIZING });
    const off = runBacktestWithParams(data, scripted({ 1: "buy", 3: "sell" }), {}, 10_000, { stopLossPercent: 0, takeProfitPercent: 5, sizing: { ...LEGACY_SIZING, useTakeProfit: false } });
    expect(on.trades[0].reason).toContain("Take profit");
    expect(off.trades[0].exitTime).toBe(4 * DAY);
  });

  it("caps size so the planned gap costs no more than the gap budget", () => {
    // A 10% budget for a 20% gap holds at most half the account, even at a
    // fixed 100% size, so the 20% gap costs 10%, not 20%.
    expect(positionCapPercent({ ...LEGACY_SIZING, maxGapLossPercent: 10, gapShockPercent: 20 })).toBe(50);
    const r = sized(bars([...flat(3), [80, 80, 80, 80]]), { 1: "buy", 2: "sell" }, { maxGapLossPercent: 10, gapShockPercent: 20 });
    expect(r.trades[0].pnl).toBeCloseTo(-1000);
  });

  it("goes flat at the drawdown limit, sits out the pause, then trades again", () => {
    const data = bars([...flat(3), [95, 95, 95, 95], [89, 89, 89, 89], ...flat(5, 89)]);
    const r = sized(data, { 1: "buy", 4: "buy", 5: "buy", 6: "buy" }, { maxDrawdownPercent: 10, drawdownPauseBars: 2 });
    expect(r.trades[0].reason).toContain("Max drawdown 10% reached");
    // Tripped at bar 4's close and out at bar 5's open. Bars 5 and 6 are sat
    // out, so bar 5's buy is dropped and bar 6's fills at bar 7's open.
    expect(r.trades[0].exitTime).toBe(5 * DAY);
    expect(r.trades[0].exitPrice).toBe(89);
    expect(r.trades[1].entryTime).toBe(7 * DAY);
  });

  it("stays out for good when the pause is 0", () => {
    const data = bars([...flat(3), [89, 89, 89, 89], ...flat(5, 89)]);
    const r = sized(data, { 1: "buy", 4: "buy", 6: "buy" }, { maxDrawdownPercent: 10, drawdownPauseBars: 0 });
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0].reason).toContain("no new trades for the rest of the run");
  });
});
