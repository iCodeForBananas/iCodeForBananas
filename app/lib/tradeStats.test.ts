import { describe, expect, it } from "vitest";
import { SAMPLE, UNAVAILABLE_DIVERGENCE, compareToBacktest, performanceStats, sampleStatus, tradesFromLedger, type ClosedTrade } from "./tradeStats";

const DAY = 86_400_000;
const T0 = Date.parse("2026-11-02T15:00:00Z"); // a Monday

/** Trades of the given dollar P&L, each sized from $10,000, one a day. */
const trades = (pnls: number[]): ClosedTrade[] => pnls.map((pnl, i) => ({ time: T0 + i * DAY, pnl, base: 10_000, count: 1, wins: pnl > 0 ? 1 : 0 }));

describe("performanceStats: trades", () => {
  // Wins 300, 100, 200; losses -100, -50, -150 (a three-trade losing streak).
  const s = performanceStats({ trades: trades([300, -100, -50, -150, 100, 200]), points: [] });

  it("counts, profit factor and expectancy in dollars, percent and R", () => {
    expect([s.trades, s.wins, s.losses]).toEqual([6, 3, 3]);
    expect(s.winRatePct).toBe(50);
    expect([s.grossProfit, s.grossLoss, s.netPnl]).toEqual([600, 300, 300]);
    expect(s.profitFactor).toBe(2);
    expect(s.expectancy).toBe(50);
    expect(s.expectancyPct).toBeCloseTo(0.5);
    // 1R is the average loss, $100: $50 a trade is 0.5R.
    expect(s.expectancyR).toBeCloseTo(0.5);
  });

  it("average win and loss, their ratio, streak, extremes and concentration", () => {
    expect(s.avgWin).toBe(200);
    expect(s.avgLoss).toBe(100);
    expect(s.avgWinPct).toBeCloseTo(2);
    expect(s.avgLossPct).toBeCloseTo(-1);
    expect(s.winLossRatio).toBe(2);
    expect(s.longestLosingStreak).toBe(3);
    expect(s.worstTrade).toEqual({ pnl: -150, pct: -1.5 });
    expect(s.bestTrade).toEqual({ pnl: 300, pct: 3 });
    expect(s.netWithoutBest).toBe(0);
    expect(s.topThreeSharePct).toBe(100);
  });

  it("t-stat of the mean trade return", () => {
    const r = [3, -1, -0.5, -1.5, 1, 2];
    const m = r.reduce((a, b) => a + b) / 6;
    const sd = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / 5);
    expect(s.tStat).toBeCloseTo(m / (sd / Math.sqrt(6)));
  });

  it("profit factor is infinite with no losses and absent with no trades", () => {
    expect(performanceStats({ trades: trades([10, 20]), points: [] }).profitFactor).toBe(Infinity);
    const none = performanceStats({ trades: [], points: [] });
    expect([none.profitFactor, none.expectancy, none.winRatePct, none.netWithoutBest]).toEqual([null, null, null, null]);
  });

  it("reads the ledger's rows", () => {
    expect(tradesFromLedger([[1, 1, 0, -96.6, 10_000]])).toEqual([{ time: 1, count: 1, wins: 0, pnl: -96.6, base: 10_000 }]);
  });
});

describe("performanceStats: equity curve", () => {
  // Up to 11,000, down to 9,900 (-10%, $1,100), back to 10,450 and still under.
  const points: [number, number][] = [
    [T0, 10_000],
    [T0 + DAY, 11_000],
    [T0 + 2 * DAY, 9_900],
    [T0 + 3 * DAY, 10_450],
  ];
  const s = performanceStats({ trades: [], points, bars: 40, barsInPosition: 10 });

  it("drawdown in percent and dollars, now, how long and how much of the time", () => {
    expect(s.maxDrawdownPct).toBeCloseTo(10);
    expect(s.maxDrawdownDollars).toBe(1_100);
    expect(s.currentDrawdownPct).toBeCloseTo(5);
    expect(s.drawdownDays).toBe(2);
    expect(s.timeInDrawdownPct).toBe(50);
  });

  it("exposure and trading days", () => {
    expect(s.exposurePct).toBe(25);
    expect(s.tradingDays).toBe(4);
  });

  it("Sortino only counts down days", () => {
    expect(s.sortino).not.toBeNull();
    expect(s.sortino!).toBeGreaterThan(s.sharpe!);
    const rising = performanceStats({ trades: [], points: [[T0, 100], [T0 + DAY, 101], [T0 + 2 * DAY, 103]] });
    expect(rising.sortino).toBeNull();
  });
});

describe("sampleStatus", () => {
  it("calls anything under the thresholds not enough data, saying what it has", () => {
    const s = sampleStatus({ trades: SAMPLE.minTrades - 1, tradingDays: 40, tStat: 5 });
    expect(s.status).toBe("insufficient");
    expect(s.detail).toContain(`${SAMPLE.minTrades - 1}/${SAMPLE.minTrades} trades`);
    expect(s.tradeStatsMeaningful).toBe(false);
    expect(sampleStatus({ trades: 100, tradingDays: SAMPLE.minDays - 1, tStat: 5 }).status).toBe("insufficient");
  });

  it("past the thresholds, sorts by how far the mean trade is from zero", () => {
    expect(sampleStatus({ trades: 30, tradingDays: 20, tStat: 2.4 }).status).toBe("edge");
    expect(sampleStatus({ trades: 30, tradingDays: 20, tStat: 0.8 }).status).toBe("unproven");
    expect(sampleStatus({ trades: 30, tradingDays: 20, tStat: -2.1 }).status).toBe("negative");
  });
});

describe("compareToBacktest", () => {
  // Backtest trades average +0.5% with a 1% spread.
  const backtest = trades(Array.from({ length: 200 }, (_, i) => (i % 2 === 0 ? 150 : -50)));

  it("waits for enough live trades", () => {
    const d = compareToBacktest(trades([-100, -100, -100, -100]), backtest);
    expect(d.status).toBe("too-early");
    expect(d.detail).toContain(`Needs ${SAMPLE.minCompareTrades} live trades`);
  });

  it("flags live trades well below the backtest's", () => {
    // 9 trades at -0.5%: a 1% gap is 3 standard errors (1% / sqrt(9) = 0.33%).
    const d = compareToBacktest(trades(Array(9).fill(-50)), backtest);
    expect(d.status).toBe("worse");
    expect(d.z!).toBeLessThanOrEqual(-SAMPLE.divergenceZ);
    expect(d.liveExpectancyPct).toBeCloseTo(-0.5);
    expect(d.backtestExpectancyPct).toBeCloseTo(0.5);
  });

  it("calls a small gap in line, a large positive one better, and no backtest absent", () => {
    expect(compareToBacktest(trades([150, -50, 150, -50, 100, 0]), backtest).status).toBe("in-line");
    expect(compareToBacktest(trades(Array(9).fill(200)), backtest).status).toBe("better");
    expect(compareToBacktest(trades(Array(9).fill(10)), null).status).toBe("no-backtest");
    expect(UNAVAILABLE_DIVERGENCE.status).toBe("unavailable");
  });
});
