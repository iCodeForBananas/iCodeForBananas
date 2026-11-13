import { describe, expect, it } from "vitest";
import type { EquityCurveRow } from "./tradingEquity";
import { dailyCloses, dailyStats, filterDeployments, tradingStats } from "./tradingStats";

// Monday 2026-11-09, 10:00 ET.
const T0 = Date.UTC(2026, 10, 9, 15, 0);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const row = (over: Partial<EquityCurveRow> = {}): EquityCurveRow => ({
  deployment_id: "ibs-mean-reversion-avgo-1h-35-75-n-ls",
  strategy_id: "ibs-mean-reversion",
  symbol: "AVGO",
  bar_interval: "1h",
  starting_at: new Date(T0).toISOString(),
  starting_equity: 10_000,
  starting_trades_closed: 1,
  starting_winning_trades: 1,
  latest_at: new Date(T0 + 2 * DAY + HOUR).toISOString(),
  position_shares: -12,
  trades_closed: 6,
  winning_trades: 4,
  points: [
    [T0, 10_000],
    [T0 + HOUR, 10_300],
    [T0 + DAY, 10_500],
    [T0 + DAY + HOUR, 9_900],
    [T0 + 2 * DAY + HOUR, 10_200],
  ],
  ...over,
});

describe("dailyCloses", () => {
  it("keeps each US/Eastern day's last value", () => {
    expect(dailyCloses(row().points)).toEqual([
      ["2026-11-09", 10_300],
      ["2026-11-10", 9_900],
      ["2026-11-11", 10_200],
    ]);
  });
});

describe("dailyStats", () => {
  it("measures day-over-day returns", () => {
    const d = dailyStats([
      ["a", 100],
      ["b", 110],
      ["c", 99],
    ]);
    expect(d.days).toBe(3);
    expect(d.bestDayPct).toBe(10);
    expect(d.worstDayPct).toBe(-10);
    expect(d.upDaysPct).toBe(50);
    expect(d.meanDailyReturnPct).toBe(0);
  });

  it("has nothing to say about a single day", () => {
    expect(dailyStats([["a", 100]])).toMatchObject({ days: 1, meanDailyReturnPct: null, annualizedSharpe: null });
  });
});

describe("tradingStats", () => {
  const now = T0 + 2 * DAY + 3 * HOUR;

  it("describes what each deployment trades and how it has done, in real dollars", () => {
    const s = tradingStats([row()], now);
    const d = s.deployments[0];
    expect(d.strategy).toMatchObject({ id: "ibs-mean-reversion", name: "IBS mean reversion" });
    expect(d.parameters).toEqual({ "Entry IBS": "35%", "Exit IBS": "75%", "Trend Filter (200 SMA)": "Off" });
    expect(d.sides).toBe("Long and short");
    expect(d).toMatchObject({ equity: 10_200, returnPct: 2, peakEquity: 10_500, position: "Short", positionShares: -12 });
    expect(d.maxDrawdownPct).toBeCloseTo(5.71, 2);
    expect(d.currentDrawdownPct).toBeCloseTo(2.86, 2);
    // Trades since the first report: 6 - 1 closed, 4 - 1 won.
    expect(d).toMatchObject({ tradesClosed: 5, winningTrades: 3, losingTrades: 2, winRatePct: 60 });
    expect(d.hoursSinceLastReport).toBe(2);
    expect(d.dailyEquity).toBeUndefined();
  });

  it("reports real dollars for a deployment that didn't start at $10,000", () => {
    const d = tradingStats([row({ starting_equity: 20_000, points: [[T0, 20_000], [T0 + HOUR, 21_000]] })], now).deployments[0];
    expect(d).toMatchObject({ startingEquity: 20_000, equity: 21_000, returnPct: 5 });
  });

  it("totals the portfolio and ranks deployments by return", () => {
    const loser = row({ deployment_id: "ema-crossover-tsla-1h-50-31-ls", strategy_id: "ema-crossover", symbol: "TSLA", points: [[T0, 10_000], [T0 + DAY, 9_000]], trades_closed: 1, winning_trades: 1 });
    const s = tradingStats([loser, row()], now, true);
    expect(s.deployments.map((d) => d.symbol)).toEqual(["AVGO", "TSLA"]);
    expect(s.portfolio).toMatchObject({ deployments: 2, totalStartingEquity: 20_000, totalEquity: 19_200, totalReturnPct: -4, tradesClosed: 5, best: { returnPct: 2 }, worst: { returnPct: -10 } });
    expect(s.deployments[0].dailyEquity).toEqual([
      ["2026-11-09", 10_300],
      ["2026-11-10", 9_900],
      ["2026-11-11", 10_200],
    ]);
  });

  it("filters by id, symbol or strategy", () => {
    const rows = [row(), row({ deployment_id: "ema-price-cross-mu-30m-63-ls", strategy_id: "ema-price-cross", symbol: "MU" })];
    expect(filterDeployments(rows, "mu").map((r) => r.symbol)).toEqual(["MU"]);
    expect(filterDeployments(rows, "IBS").map((r) => r.symbol)).toEqual(["AVGO"]);
    expect(filterDeployments(rows, undefined)).toHaveLength(2);
  });
});
