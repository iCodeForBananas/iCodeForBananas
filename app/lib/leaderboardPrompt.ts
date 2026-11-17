// The prompt the Trading Leaderboard's "Analyze in Claude" button opens:
// every live paper-trading deployment's go-live statistics, the same
// statistics from its reference backtest, whether the live trades diverge from
// it, and how the deployments' returns move together, with a request to sort
// them into cut, keep in paper and promote to real money. Claude can't reach
// the dashboard, so everything it needs is in the text. Pure.

import type { BacktestReference, Correlation } from "./backtestReference";
import type { ParamValue } from "./deploymentDetails";
import { SAMPLE, type Divergence, type PerformanceStats, type Sample } from "./tradeStats";
import type { DeploymentStats } from "./tradingStats";

export interface PromptDeployment {
  stats: DeploymentStats;
  /** Raw parameter values, as the strategy takes them; {} when unknown. */
  values: Record<string, ParamValue>;
  /** Realized P&L since this deployment's first report, and its open P&L now; null when not loaded. */
  pnl: { realized: number; open: number } | null;
  /** undefined: still loading. null: no dataset or the backtest couldn't run. */
  backtest: BacktestReference | null | undefined;
  /** Go-live statistics of the live record; null when the trade ledger couldn't be read. */
  live: PerformanceStats | null;
  sample: Sample | null;
  divergence: Divergence | null;
}

export interface PromptInput {
  deployments: PromptDeployment[];
  correlations: Correlation[];
  /** When the data was read, epoch ms. */
  asOf: number;
}

const etStamp = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

// The tables are tab-separated rather than markdown: the whole prompt rides
// in a URL, where " | " encodes to nine characters and a tab to three.
const TAB = "\t";
const has = (n: number | null | undefined): n is number => n !== null && n !== undefined && !Number.isNaN(n);
const num = (n: number | null | undefined, places = 1) => (!has(n) ? "-" : n === Infinity ? "inf" : n.toFixed(places));
const whole = (n: number | null | undefined) => (has(n) ? String(Math.round(n)) : "-");
/** 2026-11-09 as 11-09, enough with the year in the header. */
const shortDate = (iso: string) => iso.slice(5);

export function deploymentLabel(s: Pick<DeploymentStats, "symbol" | "barInterval">): string {
  return `${s.symbol} ${s.barInterval.replace("min", "m")}`;
}

const valueText = (v: ParamValue) => (typeof v === "boolean" ? (v ? "on" : "off") : String(v));

function sampleCell(sample: Sample | null, live: PerformanceStats | null): string {
  if (!sample) return "-";
  if (sample.status === "insufficient") return "LOW";
  const t = `t=${num(live?.tStat)}`;
  return sample.status === "edge" ? `EDGE ${t}` : sample.status === "negative" ? `LOSING ${t}` : `unproven ${t}`;
}

function divergenceCell(d: Divergence | null): string {
  if (!d) return "-";
  if (d.status === "too-early") return "too early";
  if (d.status === "no-backtest") return "no backtest";
  if (d.status === "unavailable") return "no trade data";
  const z = `z=${num(d.z)}`;
  return d.status === "worse" ? `WORSE ${z}` : d.status === "better" ? `BETTER ${z}` : `in line ${z}`;
}

export function buildLeaderboardPrompt({ deployments, correlations, asOf }: PromptInput): string {
  const rows = [...deployments].sort((a, b) => b.stats.returnPct - a.stats.returnPct);
  const loading = rows.some((d) => d.backtest === undefined);
  const ledgerMissing = rows.some((d) => d.live === null);
  const lines: string[] = [];

  lines.push(
    `For each of my ${rows.length} automated paper-trading deployments (a strategy and its parameters on one symbol and bar size), should I CUT it, KEEP it in paper, or PROMOTE it to real money? Data from my dashboard, ${etStamp.format(asOf)} ET; you can't reach it. An old last report means it's paused.`,
    "",
    "Each trades its own $10,000 on Tradier's sandbox (15-min delayed data, simulated fills): decides at a bar's close, market order for the next bar, all in, whole shares, no stop or target, exits on its own signal. 25% drawdown pauses entries 20 bars; 2% daily loss stops them for the day.",
    "",
    `Thresholds: trade stats mean little under ${SAMPLE.minTrades} trades or ${SAMPLE.minDays} trading days (Sample LOW). t = mean trade / standard error; |t| >= ${SAMPLE.tStat} is unlikely luck. vs BT: live mean trade against the backtest's, z in its standard errors; |z| >= ${SAMPLE.divergenceZ} means live isn't doing what was tested (from ${SAMPLE.minCompareTrades} trades). PF = profit factor; 1R = average loss (no stop).`,
  );

  // Each strategy once, with a letter and its parameter names, so rows carry
  // only the letter and the values.
  const codes = new Map<string, { code: string; keys: string }>();
  for (const d of rows) {
    if (!codes.has(d.stats.strategy.name)) codes.set(d.stats.strategy.name, { code: String.fromCharCode(65 + codes.size), keys: Object.keys(d.values).join("/") });
  }
  lines.push(`Strategies: ${[...codes].map(([name, { code, keys }]) => `${code} = ${name}${keys ? ` (${keys})` : ""}`).join("; ")}. All trade long and short unless marked L.`);

  lines.push(
    "",
    "## Live paper record, since each started reporting (tab-separated)",
    ["Deployment", "Strategy params", "Trading days", "Last report h", "Trades W/L", "Sample", "vs BT", "PF", "Exp%/trade (R)", "Avg win/loss%", "Worst%", "Losing run", "Net w/o best$", "Expo%", "Return%", "Realized$", "MaxDD% ($)", "DD now% (d)", "Sharpe/Sortino", "Pos"].join(TAB),
  );
  for (const { stats: s, values, pnl, live, sample, divergence } of rows) {
    const params = Object.values(values).map(valueText).join("/") || "?";
    lines.push(
      [
        deploymentLabel(s),
        `${codes.get(s.strategy.name)!.code} ${params}${s.sides === "Long only" ? " L" : ""}`,
        live ? String(live.tradingDays) : "-",
        num((asOf - Date.parse(s.lastReport)) / 3_600_000, 0),
        `${s.tradesClosed} ${s.winningTrades}/${s.losingTrades}`,
        sampleCell(sample, live),
        divergenceCell(divergence),
        num(live?.profitFactor, 2),
        live ? `${num(live.expectancyPct, 2)} (${num(live.expectancyR, 2)})` : "-",
        live ? `${num(live.avgWinPct, 2)}/${num(live.avgLossPct, 2)}` : "-",
        num(live?.worstTrade?.pct, 2),
        live ? String(live.longestLosingStreak) : "-",
        whole(live?.netWithoutBest),
        num(live?.exposurePct, 0),
        num(s.returnPct, 2),
        pnl ? whole(pnl.realized) : "-",
        live ? `${num(live.maxDrawdownPct)} (${whole(live.maxDrawdownDollars)})` : num(s.maxDrawdownPct),
        live ? `${num(live.currentDrawdownPct)} (${num(live.drawdownDays)})` : num(s.currentDrawdownPct),
        !live ? "-" : live.tradingDays < SAMPLE.minDays ? `<${SAMPLE.minDays}d` : `${num(live.sharpe)}/${num(live.sortino)}`,
        s.position,
      ].join(TAB),
    );
  }
  lines.push("Realized $ is closed-trade P&L since the record began. Sharpe/Sortino are annualized from daily returns.");
  if (ledgerMissing) lines.push("Trade-level stats (profit factor and the rest) couldn't be read for rows showing '-'.");

  lines.push(
    "",
    `## Reference backtest: same strategy, params and sizing, on my historical data to ${new Date(asOf).getUTCFullYear()} (tab-separated)`,
    ["Deployment", "Years", "CAGR%", "MaxDD%", "Sharpe/Sortino", "Trades/mo", "Win%", "PF", "Exp%/trade", "Expo%", "Same window BT%/live%"].join(TAB),
  );
  // The same-window comparison runs from each live record's start to the end
  // of the data, which is the same day for nearly all; say it once.
  const ends = rows.map((d) => d.backtest?.sameWindow?.to).filter((t): t is string => !!t);
  const count = (t: string) => ends.filter((x) => x === t).length;
  const commonEnd = [...ends].sort((a, b) => count(b) - count(a))[0];
  for (const { stats: s, backtest: b } of rows) {
    if (b === undefined) lines.push([deploymentLabel(s), "still loading when copied"].join(TAB));
    else if (b === null) lines.push([deploymentLabel(s), "no backtest (no matching dataset)"].join(TAB));
    else {
      lines.push(
        [
          deploymentLabel(s),
          num(b.years),
          num(b.cagrPct),
          num(b.maxDrawdownPct),
          `${num(b.stats.sharpe)}/${num(b.stats.sortino)}`,
          num(b.tradesPerMonth),
          b.winRatePct === null ? "-" : num(b.winRatePct, 0),
          num(b.stats.profitFactor, 2),
          num(b.stats.expectancyPct, 2),
          num(b.stats.exposurePct, 0),
          b.sameWindow
            ? `${num(b.sameWindow.backtestPct, 2)}/${num(b.sameWindow.livePct, 2)}${b.sameWindow.to !== commonEnd ? ` (to ${shortDate(b.sameWindow.to)})` : ""}${b.sameWindow.backtestInTradeAtStart ? "*" : ""}`
            : "no overlap yet",
        ].join(TAB),
      );
    }
  }
  if (commonEnd) lines.push(`Same window: from each live record's start to ${shortDate(commonEnd)}, the end of my data.`);
  if (rows.some((d) => d.backtest?.sameWindow?.backtestInTradeAtStart)) lines.push("* The backtest was already in a trade when the live record began.");
  lines.push("The backtest has no 2% daily loss cap and no costs.");

  const strong = correlations.filter((c) => Math.abs(c.r) >= 0.3).slice(0, 5);
  const label = new Map(rows.map((d) => [d.stats.id, deploymentLabel(d.stats)]));
  lines.push("", "## Correlation of backtest daily returns (|r| >= 0.3, strongest first)");
  if (loading && correlations.length === 0) lines.push("Not computed: backtests were still loading.");
  else if (strong.length === 0) lines.push("No pair reaches 0.3.");
  else for (const c of strong) lines.push(`${label.get(c.a) ?? c.a} ~ ${label.get(c.b) ?? c.b}: ${num(c.r, 2)} over ${c.days} days`);

  lines.push(
    "",
    "## What I want",
    "Per deployment: CUT, KEEP IN PAPER, PROMOTE or TOO EARLY TO CALL, your confidence, and 1-3 sentences citing numbers. Don't rank by return. Weigh:",
    "1. Sample: LOW is too early whatever its PF; say how many more trades or weeks it needs.",
    "2. Live vs backtest: WORSE should stop a promotion. Compare win rate, PF, expectancy, trade pace and exposure too. A same-window gap is execution (delay, fills, timing), not the market, unless marked *.",
    "3. Risk: drawdown vs the backtest's, worst trade, losing streak, and whether profit rests on one trade (Net w/o best).",
    "4. Correlation: don't promote several versions of one bet; from a correlated cluster or one underlying, at most one, and say which.",
    "5. Real money: would slippage, commissions, shorting or real-time data break it?",
    "State your uncertainty; too early is a valid answer, don't force verdicts. End with what to promote first, if anything, at what size, and what would change your mind.",
  );

  return lines.join("\n");
}
