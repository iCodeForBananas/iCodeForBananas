import { describe, expect, it } from "vitest";
import { addToGroups, filteredCount, matchesFilter, needsScan, toRow, type RowFilter, type RunGroup, type RunMeta } from "./runStore";
import type { ResultSummary } from "./backtestDb";

const summary = (over: Partial<ResultSummary>): ResultSummary =>
  ({
    params: {},
    label: "",
    totalPnl: 0,
    totalPnlPercent: 10,
    winRate: 50,
    totalTrades: 4,
    winningTrades: 2,
    losingTrades: 2,
    averageWin: 1,
    averageLoss: 1,
    profitFactor: 1,
    maxDrawdown: 0,
    maxDrawdownPercent: 5,
    sharpeRatio: 1,
    buyAndHoldPnl: 0,
    buyAndHoldPnlPercent: 5,
    strategyId: "turtle",
    strategyName: "Turtle Breakout",
    dataset: "SPY-1d.csv",
    ...over,
  }) as ResultSummary;

describe("toRow", () => {
  it("keys the row by run and order and derives alpha", () => {
    const row = toRow("run-1", 7, summary({ totalPnlPercent: 12, buyAndHoldPnlPercent: 5 }));
    expect([row.runId, row.seq, row.alpha]).toEqual(["run-1", 7, 7]);
  });

  it("replaces NaN sort fields, which an index would silently drop, and keeps Infinity", () => {
    const row = toRow("r", 0, summary({ sharpeRatio: NaN, profitFactor: Infinity }));
    expect(row.sharpeRatio).toBe(0);
    expect(row.profitFactor).toBe(Infinity);
  });
});

describe("filtered counts", () => {
  const groups = new Map<string, RunGroup>();
  addToGroups(groups, summary({}));
  addToGroups(groups, summary({ totalPnlPercent: 1 }));
  addToGroups(groups, summary({ dataset: "AAPL-1d.csv" }));
  addToGroups(groups, summary({ strategyId: "rsi2", strategyName: "RSI-2" }));
  const meta: RunMeta = { runId: "r", createdAt: 0, total: 4, groups: [...groups.values()] };

  it("tallies by strategy and dataset", () => {
    expect(meta.groups).toHaveLength(3);
    expect(meta.groups.find((g) => g.strategyId === "turtle" && g.dataset === "SPY-1d.csv")).toMatchObject({ total: 2, beats: 1 });
  });

  it("matches what a scan of the rows would count", () => {
    const rows = [summary({}), summary({ totalPnlPercent: 1 }), summary({ dataset: "AAPL-1d.csv" }), summary({ strategyId: "rsi2" })];
    const filters = [
      { beatsBuyHold: false },
      { beatsBuyHold: true },
      { strategyId: "turtle", beatsBuyHold: false },
      { dataset: "SPY-1d.csv", beatsBuyHold: true },
      { strategyId: "rsi2", dataset: "AAPL-1d.csv", beatsBuyHold: false },
    ];
    for (const f of filters) {
      expect(filteredCount(meta, f)).toBe(rows.filter((r) => matchesFilter(r, f)).length);
    }
  });
});

describe("result filters", () => {
  const base = { beatsBuyHold: false };
  const pass = (over: Partial<ResultSummary>, f: Partial<RowFilter>) => matchesFilter(summary(over), { ...base, ...f });

  it("drops runs with too few trades", () => {
    expect(pass({ totalTrades: 1 }, { minTrades: 10 })).toBe(false);
    expect(pass({ totalTrades: 10 }, { minTrades: 10 })).toBe(true);
    expect(pass({ totalTrades: 1 }, { minTrades: 0 })).toBe(true);
  });

  it("drops an infinite profit factor only when asked", () => {
    expect(pass({ profitFactor: Infinity }, { finiteProfitFactor: true })).toBe(false);
    expect(pass({ profitFactor: 2.5 }, { finiteProfitFactor: true })).toBe(true);
    expect(pass({ profitFactor: Infinity }, {})).toBe(true);
  });

  it("filters on drawdown, total P&L and out-of-sample P&L", () => {
    expect(pass({ maxDrawdownPercent: 25 }, { maxDrawdownPct: 20 })).toBe(false);
    expect(pass({ maxDrawdownPercent: 20 }, { maxDrawdownPct: 20 })).toBe(true);
    expect(pass({ totalPnlPercent: -1 }, { profitable: true })).toBe(false);
    expect(pass({ totalPnlPercent: 0 }, { profitable: true })).toBe(false);
    expect(pass({ outOfSamplePnlPercent: -3 }, { profitableOutOfSample: true })).toBe(false);
    expect(pass({ outOfSamplePnlPercent: 4 }, { profitableOutOfSample: true })).toBe(true);
    expect(pass({ outOfSamplePnlPercent: undefined }, { profitableOutOfSample: true })).toBe(false);
  });

  it("needs a scan to count only for filters the group tallies don't cover", () => {
    expect(needsScan({ beatsBuyHold: true, strategyId: "turtle" })).toBe(false);
    expect(needsScan({ beatsBuyHold: false, minTrades: 5 })).toBe(true);
    expect(needsScan({ beatsBuyHold: false, maxDrawdownPct: 0 })).toBe(true);
    expect(needsScan({ beatsBuyHold: false, finiteProfitFactor: true })).toBe(true);
  });
});
