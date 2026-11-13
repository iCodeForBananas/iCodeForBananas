import { describe, expect, it } from "vitest";
import { buildLeaderboardPrompt, type PromptDeployment } from "./leaderboardPrompt";
import { claudePrefillUrl, CLAUDE_PREFILL_MAX, fitsClaudePrefill } from "./claudeLink";
import type { DeploymentStats } from "./tradingStats";
import type { BacktestReference } from "./backtestReference";

const NOW = Date.parse("2026-11-13T15:00:00Z");

function stats(over: Partial<DeploymentStats>): DeploymentStats {
  return {
    id: "ibs-mean-reversion-qqq-15m-20-50-n-ls",
    strategy: { id: "ibs-mean-reversion", name: "IBS mean reversion", description: null },
    symbol: "QQQ",
    barInterval: "15min",
    sides: "Long and short",
    parameters: {},
    liveSince: "2026-11-09T15:00:00Z",
    lastReport: "2026-11-13T14:45:00Z",
    hoursSinceLastReport: 0.3,
    startingEquity: 10_000,
    equity: 10_250,
    returnPct: 2.5,
    maxDrawdownPct: 1.2,
    currentDrawdownPct: 0.4,
    peakEquity: 10_290,
    position: "Flat",
    positionShares: 0,
    tradesClosed: 6,
    winningTrades: 4,
    losingTrades: 2,
    winRatePct: 66.7,
    daily: { days: 5, meanDailyReturnPct: 0.5, stdevDailyReturnPct: 0.4, bestDayPct: 1, worstDayPct: -0.2, upDaysPct: 75, annualizedSharpe: 19.8 },
    ...over,
  };
}

const ref: BacktestReference = {
  dataset: "QQQ-15m.csv",
  from: "2025-11-12",
  to: "2026-11-11",
  years: 1,
  returnPct: 18,
  cagrPct: 18,
  maxDrawdownPct: 9.5,
  sharpe: 1.4,
  trades: 300,
  winRatePct: 61,
  tradesPerMonth: 25,
  sameWindow: { from: "2026-11-09", to: "2026-11-11", backtestPct: 1.1, livePct: 0.6, backtestInTradeAtStart: false },
  dailyReturns: [],
};

const deployments: PromptDeployment[] = [
  { stats: stats({}), values: { entryIbs: 20, exitIbs: 50, trendFilter: false }, pnl: { realized: 230.4, open: -12 }, backtest: ref },
  {
    stats: stats({ id: "ema-crossover-aapl-1d-3-161-l", strategy: { id: "ema-crossover", name: "EMA crossover", description: null }, symbol: "AAPL", barInterval: "1d", sides: "Long only", returnPct: -0.8, tradesClosed: 0, winningTrades: 0, losingTrades: 0, winRatePct: null }),
    values: { fastPeriod: 3, slowPeriod: 161 },
    pnl: null,
    backtest: null,
  },
];

describe("buildLeaderboardPrompt", () => {
  const prompt = buildLeaderboardPrompt({ deployments, correlations: [{ a: deployments[0].stats.id, b: deployments[1].stats.id, r: 0.62, days: 240 }], asOf: NOW });

  it("asks for the three-way split, with too-early allowed, and not a ranking by return", () => {
    expect(prompt).toMatch(/CUT it, KEEP it in paper, or PROMOTE it to real money/);
    expect(prompt).toMatch(/TOO EARLY TO CALL/);
    expect(prompt).toMatch(/Don't rank by return/);
    for (const topic of [/Sample size/, /Live vs backtest/, /Drawdown/, /Correlation: don't promote several versions of the same bet/, /State your uncertainty/]) expect(prompt).toMatch(topic);
  });

  it("carries each deployment's live stats, params and P&L, best return first", () => {
    const cells = (start: string) => prompt.split("\n").find((l) => l.startsWith(start))!.split("\t");
    expect(cells("QQQ 15m\tIBS")).toEqual(["QQQ 15m", "IBS mean reversion (entryIbs 20, exitIbs 50, trendFilter off)", "long+short", "4.0", "0.3", "6 4/2", "67", "2.50", "230", "-12", "1.20", "0.40", "19.80 (4)", "Flat"]);
    expect(prompt.indexOf("QQQ 15m\tIBS")).toBeLessThan(prompt.indexOf("AAPL 1d\tEMA"));
    expect(cells("AAPL 1d\tEMA")).toEqual(["AAPL 1d", "EMA crossover (fastPeriod 3, slowPeriod 161)", "long", "4.0", "0.3", "0 0/0", "-", "-0.80", "-", "-", "1.20", "0.40", "19.80 (4)", "Flat"]);
    expect(prompt).toMatch(/Open \$ is the open position's whole P&L now, which can include a move from before the record began/);
  });

  it("carries the reference backtest, the same-window comparison and the correlations", () => {
    expect(prompt).toContain(["QQQ 15m", "1.0 (to 11-11)", "18.0", "9.5", "1.40", "25.0", "61", "1.10 / 0.60 (11-09 to 11-11)"].join("\t"));
    expect(prompt).toContain("AAPL 1d\tno backtest (no matching dataset)");
    expect(prompt).toContain("QQQ 15m ~ AAPL 1d: 0.62 over 240 days");
  });

  it("flags a same-window comparison where the backtest was already in a trade", () => {
    const inTrade = { ...ref, sameWindow: { ...ref.sameWindow!, backtestInTradeAtStart: true } };
    const p = buildLeaderboardPrompt({ deployments: [{ ...deployments[0], backtest: inTrade }], correlations: [], asOf: NOW });
    expect(p).toContain("1.10 / 0.60 (11-09 to 11-11)*");
    expect(p).toContain("* The backtest was already in a trade when the live record began.");
    expect(prompt).not.toContain("* The backtest was already in a trade");
  });

  it("says so when backtests were still loading", () => {
    const p = buildLeaderboardPrompt({ deployments: deployments.map((d) => ({ ...d, backtest: undefined })), correlations: [], asOf: NOW });
    expect(p).toContain("QQQ 15m\tstill loading when copied");
    expect(p).toContain("Not computed: backtests were still loading.");
  });

  it("fits the Claude link with a dozen deployments and eight correlated pairs", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ ...deployments[0], stats: stats({ id: `d${i}`, symbol: `SYM${i}` }) }));
    const pairs = Array.from({ length: 8 }, (_, i) => ({ a: `d${i}`, b: `d${i + 1}`, r: -0.45, days: 250 }));
    const p = buildLeaderboardPrompt({ deployments: many, correlations: pairs, asOf: NOW });
    expect(fitsClaudePrefill(p)).toBe(true);
  });
});

describe("claudePrefillUrl", () => {
  it("prefills when it fits and declines when it doesn't", () => {
    expect(claudePrefillUrl("hi there")).toBe("https://claude.ai/new?q=hi%20there");
    expect(claudePrefillUrl("x".repeat(CLAUDE_PREFILL_MAX + 1))).toBeNull();
  });
});
