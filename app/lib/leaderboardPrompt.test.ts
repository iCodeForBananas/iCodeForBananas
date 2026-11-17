import { describe, expect, it } from "vitest";
import { buildLeaderboardPrompt, type PromptDeployment } from "./leaderboardPrompt";
import { claudePrefillUrl, CLAUDE_PREFILL_MAX, fitsClaudePrefill } from "./claudeLink";
import { compareToBacktest, performanceStats, sampleStatus, type ClosedTrade } from "./tradeStats";
import type { DeploymentStats } from "./tradingStats";
import type { BacktestReference } from "./backtestReference";

const NOW = Date.parse("2026-11-13T15:00:00Z");
const DAY = 86_400_000;

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

const closed = (pnls: number[]): ClosedTrade[] => pnls.map((pnl, i) => ({ time: NOW - (pnls.length - i) * DAY, pnl, base: 10_000, count: 1, wins: pnl > 0 ? 1 : 0 }));
const points: [number, number][] = [[NOW - 5 * DAY, 10_000], [NOW - 4 * DAY, 10_100], [NOW - 3 * DAY, 10_050], [NOW - 2 * DAY, 10_200], [NOW - DAY, 10_250]];

const btTrades = closed(Array.from({ length: 100 }, (_, i) => (i % 2 ? 150 : -50)));
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
  closedTrades: btTrades,
  stats: performanceStats({ trades: btTrades, points, bars: 100, barsInPosition: 40 }),
};

function deployment(over: Partial<DeploymentStats>, liveTrades: ClosedTrade[] | null, backtest: BacktestReference | null | undefined, values: PromptDeployment["values"]): PromptDeployment {
  const live = liveTrades ? performanceStats({ trades: liveTrades, points, bars: 50, barsInPosition: 20 }) : null;
  return {
    stats: stats(over),
    values,
    pnl: { realized: 230.4, open: -12 },
    backtest,
    live,
    sample: sampleStatus(live ?? { trades: 0, tradingDays: 0, tStat: null }),
    divergence: liveTrades && backtest !== undefined ? compareToBacktest(liveTrades, backtest ? backtest.closedTrades : null) : null,
  };
}

const qqq = deployment({}, closed([100, -50, 80, -40, 60, 30]), ref, { entryIbs: 20, exitIbs: 50, trendFilter: false });
const aapl = deployment(
  { id: "ema-crossover-aapl-1d-3-161-l", strategy: { id: "ema-crossover", name: "EMA crossover", description: null }, symbol: "AAPL", barInterval: "1d", sides: "Long only", returnPct: -0.8, tradesClosed: 0, winningTrades: 0, losingTrades: 0 },
  [],
  null,
  { fastPeriod: 3, slowPeriod: 161 },
);
const cells = (prompt: string, start: string) => prompt.split("\n").find((l) => l.startsWith(start))!.split("\t");

describe("buildLeaderboardPrompt", () => {
  const prompt = buildLeaderboardPrompt({ deployments: [aapl, qqq], correlations: [{ a: qqq.stats.id, b: aapl.stats.id, r: 0.62, days: 240 }], asOf: NOW });

  it("asks for the three-way split, with too-early allowed, and states the thresholds", () => {
    expect(prompt).toMatch(/CUT it, KEEP it in paper, or PROMOTE it to real money/);
    expect(prompt).toMatch(/TOO EARLY TO CALL/);
    expect(prompt).toMatch(/Don't rank by return/);
    expect(prompt).toMatch(/trade stats mean little under 30 trades or 20 trading days/);
    expect(prompt).toMatch(/\|z\| >= 2 means live isn't doing what was tested/);
    expect(prompt).toMatch(/LOW is too early whatever its PF/);
    expect(prompt).toMatch(/WORSE should stop a promotion/);
    expect(prompt).toMatch(/1R = average loss/);
  });

  it("names parameters once per strategy and carries only values on rows", () => {
    expect(prompt).toContain("Strategies: A = IBS mean reversion (entryIbs/exitIbs/trendFilter); B = EMA crossover (fastPeriod/slowPeriod). All trade long and short unless marked L.");
    expect(cells(prompt, "QQQ 15m")[1]).toBe("A 20/50/off");
    expect(cells(prompt, "AAPL 1d")[1]).toBe("B 3/161 L");
  });

  it("carries the go-live statistics, best return first", () => {
    const row = cells(prompt, "QQQ 15m");
    const header = prompt.split("\n").find((l) => l.startsWith("Deployment\tStrategy params"))!.split("\t");
    const at = (name: string) => row[header.indexOf(name)];
    expect(at("Trades W/L")).toBe("6 4/2");
    expect(at("Trading days")).toBe("5");
    expect(at("Sample")).toBe("LOW");
    expect(at("vs BT")).toMatch(/^in line z=/);
    expect(at("PF")).toBe("3.00");
    expect(at("Exp%/trade (R)")).toBe("0.30 (0.67)");
    expect(at("Avg win/loss%")).toBe("0.67/-0.45");
    expect(at("Sharpe/Sortino")).toBe("<20d");
    expect(at("Worst%")).toBe("-0.50");
    expect(at("Losing run")).toBe("1");
    expect(at("Net w/o best$")).toBe("80");
    expect(at("Expo%")).toBe("40");
    expect(at("Realized$")).toBe("230");
    expect(prompt.indexOf("QQQ 15m\t")).toBeLessThan(prompt.indexOf("AAPL 1d\t"));
  });

  it("carries the backtest's same statistics, the same-window comparison and the correlations", () => {
    const row = cells(prompt.slice(prompt.indexOf("## Reference backtest")), "QQQ 15m");
    expect(row.slice(0, 4)).toEqual(["QQQ 15m", "1.0", "18.0", "9.5"]);
    expect(row[7]).toBe("3.00");
    expect(row[10]).toBe("1.10/0.60");
    expect(prompt).toContain("Same window: from each live record's start to 11-11, the end of my data.");
    expect(prompt).toContain("AAPL 1d\tno backtest (no matching dataset)");
    expect(prompt).toContain("QQQ 15m ~ AAPL 1d: 0.62 over 240 days");
  });

  it("flags divergence, a backtest already in a trade, missing ledgers and loading backtests", () => {
    const worse = deployment({}, closed(Array(9).fill(-50)), ref, { entryIbs: 20 });
    expect(cells(buildLeaderboardPrompt({ deployments: [worse], correlations: [], asOf: NOW }), "QQQ 15m")).toContain("WORSE z=-3.0");
    const inTrade = { ...qqq, backtest: { ...ref, sameWindow: { ...ref.sameWindow!, backtestInTradeAtStart: true } } };
    expect(buildLeaderboardPrompt({ deployments: [inTrade], correlations: [], asOf: NOW })).toContain("* The backtest was already in a trade when the live record began.");
    const noLedger = deployment({}, null, ref, {});
    expect(buildLeaderboardPrompt({ deployments: [noLedger], correlations: [], asOf: NOW })).toContain("Trade-level stats (profit factor and the rest) couldn't be read");
    const loading = deployment({}, closed([10]), undefined, {});
    const p = buildLeaderboardPrompt({ deployments: [loading], correlations: [], asOf: NOW });
    expect(p).toContain("QQQ 15m\tstill loading when copied");
    expect(p).toContain("Not computed: backtests were still loading.");
  });

  it("fits the Claude link with 12 fully filled-in deployments and eight correlated pairs", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ ...qqq, stats: stats({ id: `d${i}`, symbol: `SYM${i}` }) }));
    const pairs = Array.from({ length: 8 }, (_, i) => ({ a: `d${i}`, b: `d${i + 1}`, r: -0.45, days: 250 }));
    const p = buildLeaderboardPrompt({ deployments: many, correlations: pairs, asOf: NOW });
    expect(encodeURIComponent(p).length).toBeLessThanOrEqual(CLAUDE_PREFILL_MAX);
    expect(fitsClaudePrefill(p)).toBe(true);
  });
});

describe("claudePrefillUrl", () => {
  it("prefills when it fits and declines when it doesn't", () => {
    expect(claudePrefillUrl("hi there")).toBe("https://claude.ai/new?q=hi%20there");
    expect(claudePrefillUrl("x".repeat(CLAUDE_PREFILL_MAX + 1))).toBeNull();
  });
});
