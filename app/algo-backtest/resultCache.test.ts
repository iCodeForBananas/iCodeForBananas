import { describe, expect, it } from "vitest";
import type { ParameterizedResult } from "@/app/strategies";
import { DEFAULT_SIZING } from "@/app/lib/backtest-engine";
import { packFull, resultCacheKey, toSummary, unpackFull, type ResultCacheKeyInput } from "./resultCache";

const base: ResultCacheKeyInput = {
  codeVersion: "code-a",
  dataset: "SPY-1d-2026-09-21.csv",
  dataHash: "hash-a",
  strategyId: "turtle",
  params: { entryPeriod: 20, exitPeriod: 10 },
  stopLossPercent: 1,
  takeProfitPercent: 0,
  positionSizePercent: 100,
  commissionBps: 0,
  slippageBps: 0,
  enableShorts: false,
  sizing: DEFAULT_SIZING,
  initialCapital: 100_000,
};

describe("resultCacheKey", () => {
  it("is the same for the same run, whatever order the params arrive in", () => {
    const reordered = { ...base, params: { exitPeriod: 10, entryPeriod: 20 } };
    expect(resultCacheKey(reordered)).toBe(resultCacheKey(base));
    const sizingReordered = Object.fromEntries(Object.entries(DEFAULT_SIZING).reverse()) as typeof DEFAULT_SIZING;
    expect(resultCacheKey({ ...base, sizing: sizingReordered })).toBe(resultCacheKey(base));
  });

  // Every input that can change a result has to change the key, or a run
  // with different settings could be served another run's numbers.
  const changes: [string, Partial<ResultCacheKeyInput>][] = [
    ["code", { codeVersion: "code-b" }],
    ["dataset file", { dataset: "SPY-1h-2026-09-21.csv" }],
    ["data contents", { dataHash: "hash-b" }],
    ["strategy", { strategyId: "donchian-channel" }],
    ["a param value", { params: { entryPeriod: 55, exitPeriod: 10 } }],
    ["an added param", { params: { entryPeriod: 20, exitPeriod: 10, extra: true } }],
    ["a param's type", { params: { entryPeriod: "20", exitPeriod: 10 } }],
    ["stop loss", { stopLossPercent: 2 }],
    ["take profit", { takeProfitPercent: 5 }],
    ["position size", { positionSizePercent: 50 }],
    ["commission", { commissionBps: 1 }],
    ["slippage", { slippageBps: 1 }],
    ["shorts", { enableShorts: true }],
    ["sizing mode", { sizing: { ...DEFAULT_SIZING, mode: "fixed" } }],
    ["risk per trade", { sizing: { ...DEFAULT_SIZING, riskPercent: 0.5 } }],
    ["max position", { sizing: { ...DEFAULT_SIZING, maxPositionPercent: 50 } }],
    ["ATR stop", { sizing: { ...DEFAULT_SIZING, atrStopMultiple: 3 } }],
    ["planned gap", { sizing: { ...DEFAULT_SIZING, gapShockPercent: 30 } }],
    ["gap budget", { sizing: { ...DEFAULT_SIZING, maxGapLossPercent: 5 } }],
    ["drawdown limit", { sizing: { ...DEFAULT_SIZING, maxDrawdownPercent: 15 } }],
    ["drawdown pause", { sizing: { ...DEFAULT_SIZING, drawdownPauseBars: 0 } }],
    ["stop loss switch", { sizing: { ...DEFAULT_SIZING, useStopLoss: false } }],
    ["take profit switch", { sizing: { ...DEFAULT_SIZING, useTakeProfit: true } }],
    ["whole shares", { sizing: { ...DEFAULT_SIZING, wholeShares: !DEFAULT_SIZING.wholeShares } }],
    ["stop and reverse", { sizing: { ...DEFAULT_SIZING, allowReversal: !DEFAULT_SIZING.allowReversal } }],
    ["stop sweep", { sizing: { ...DEFAULT_SIZING, stopLossRange: { min: 1, max: 3, step: 1 } } }],
    ["take profit sweep", { sizing: { ...DEFAULT_SIZING, takeProfitRange: { min: 2, max: 6, step: 2 } } }],
    ["starting capital", { initialCapital: 10_000 }],
  ];
  for (const [what, change] of changes) {
    it(`changes with ${what}`, () => {
      expect(resultCacheKey({ ...base, ...change })).not.toBe(resultCacheKey(base));
    });
  }
});

describe("summary and full data", () => {
  const result = {
    params: { entryPeriod: 20 },
    label: "entryPeriod=20",
    totalPnl: 1234.5,
    totalPnlPercent: 12.345,
    trades: [{ id: "t1", side: "LONG", entryPrice: 1, entryTime: 0, exitPrice: 2, exitTime: 86_400_000, pnl: 1, pnlPercent: 100, reason: "x" }],
    equityCurve: [
      { time: 0, equity: 100_000 },
      { time: 86_400_000, equity: 100_123.456789 },
    ],
  } as unknown as ParameterizedResult;

  it("drops trades and the equity curve from a summary, and nothing else", () => {
    const summary = toSummary(result);
    expect("trades" in summary).toBe(false);
    expect("equityCurve" in summary).toBe(false);
    expect(summary.totalPnlPercent).toBe(12.345);
    expect(result.trades).toHaveLength(1);
  });

  it("round-trips the equity curve exactly through its packed form", () => {
    const back = unpackFull(toSummary(result), packFull(result));
    expect(back.equityCurve).toEqual(result.equityCurve);
    expect(back.trades).toEqual(result.trades);
    expect(back.totalPnl).toBe(result.totalPnl);
  });
});
