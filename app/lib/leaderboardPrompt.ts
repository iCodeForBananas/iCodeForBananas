// The prompt the Trading Leaderboard's "Analyze in Claude" button opens:
// every live paper-trading deployment's record, its reference backtest and how
// the deployments' returns move together, with a request to sort them into
// cut, keep in paper and promote to real money. Claude can't reach the
// dashboard, so everything it needs is in the text. Pure.

import type { BacktestReference, Correlation } from "./backtestReference";
import type { ParamValue } from "./deploymentDetails";
import type { DeploymentStats } from "./tradingStats";

export interface PromptDeployment {
  stats: DeploymentStats;
  /** Raw parameter values, as the strategy takes them; {} when unknown. */
  values: Record<string, ParamValue>;
  /** Realized P&L since this deployment's first report, and its open P&L now; null when not loaded. */
  pnl: { realized: number; open: number } | null;
  /** undefined: still loading. null: no dataset or the backtest couldn't run. */
  backtest: BacktestReference | null | undefined;
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
const num = (n: number | null | undefined, places = 2) => (n === null || n === undefined || Number.isNaN(n) ? "-" : n.toFixed(places));
const whole = (n: number) => String(Math.round(n));
/** 2026-11-09 as 11-09, enough with the year in the header. */
const shortDate = (iso: string) => iso.slice(5);

export function deploymentLabel(s: Pick<DeploymentStats, "symbol" | "barInterval">): string {
  return `${s.symbol} ${s.barInterval.replace("min", "m")}`;
}

function paramText(values: Record<string, ParamValue>): string {
  const entries = Object.entries(values);
  return entries.length ? entries.map(([k, v]) => `${k} ${typeof v === "boolean" ? (v ? "on" : "off") : v}`).join(", ") : "params unknown";
}

function liveDays(s: DeploymentStats, asOf: number): number {
  return (asOf - Date.parse(s.liveSince)) / 86_400_000;
}

export function buildLeaderboardPrompt({ deployments, correlations, asOf }: PromptInput): string {
  const rows = [...deployments].sort((a, b) => b.stats.returnPct - a.stats.returnPct);
  const loading = rows.some((d) => d.backtest === undefined);
  const lines: string[] = [];

  lines.push(
    `Help me decide what to do with each of my ${rows.length} automated paper-trading deployments (one strategy and its parameters on one symbol and bar size): CUT it, KEEP it in paper, or PROMOTE it to real money. Data from my dashboard as of ${etStamp.format(asOf)} ET; you can't reach it. One whose last report is old has been paused.`,
    "",
    "How they run: each deployment trades its own $10,000 on Tradier's sandbox (data 15 min delayed, simulated fills). It decides at each bar close and sends a market order for the next bar; 100% of its equity, whole shares, no stop or target, exits only on its strategy's signal. A 25% drawdown pauses entries for 20 bars, and a 2% daily loss stops entries for the day.",
    "",
    "## Live paper record, since each started reporting (tab-separated)",
    ["Deployment", "Strategy (params)", "Sides", "Days live", "Last report h ago", "Trades W/L", "Win %", "Return %", "Realized $", "Open $", "Max DD %", "DD now %", "Sharpe (n days)", "Position"].join(TAB),
  );
  for (const { stats: s, values, pnl } of rows) {
    lines.push(
      [
        deploymentLabel(s),
        `${s.strategy.name} (${paramText(values)})`,
        s.sides === "Long only" ? "long" : s.sides === "Long and short" ? "long+short" : "-",
        num(liveDays(s, asOf), 1),
        num((asOf - Date.parse(s.lastReport)) / 3_600_000, 1),
        `${s.tradesClosed} ${s.winningTrades}/${s.losingTrades}`,
        s.winRatePct === null ? "-" : num(s.winRatePct, 0),
        num(s.returnPct),
        pnl ? whole(pnl.realized) : "-",
        pnl ? whole(pnl.open) : "-",
        num(s.maxDrawdownPct),
        num(s.currentDrawdownPct),
        `${num(s.daily.annualizedSharpe)} (${Math.max(s.daily.days - 1, 0)})`,
        s.position,
      ].join(TAB),
    );
  }
  lines.push(
    "Returns, drawdowns and trades count from when each record began. Realized $ is closed-trade P&L since then; Open $ is the open position's whole P&L now, which can include a move from before the record began.",
  );

  lines.push(
    "",
    `## Reference backtest: same strategy, params and sizing, on my historical data to ${new Date(asOf).getUTCFullYear()} (tab-separated)`,
    ["Deployment", "Years of data", "CAGR %", "Max DD %", "Sharpe", "Trades/mo", "Win %", "Same window: backtest % / live % (dates)"].join(TAB),
  );
  for (const { stats: s, backtest: b } of rows) {
    if (b === undefined) lines.push([deploymentLabel(s), "still loading when copied"].join(TAB));
    else if (b === null) lines.push([deploymentLabel(s), "no backtest (no matching dataset)"].join(TAB));
    else {
      lines.push(
        [
          deploymentLabel(s),
          `${num(b.years, 1)} (to ${shortDate(b.to)})`,
          num(b.cagrPct, 1),
          num(b.maxDrawdownPct, 1),
          num(b.sharpe),
          num(b.tradesPerMonth, 1),
          b.winRatePct === null ? "-" : num(b.winRatePct, 0),
          b.sameWindow
            ? `${num(b.sameWindow.backtestPct)} / ${num(b.sameWindow.livePct)} (${shortDate(b.sameWindow.from)} to ${shortDate(b.sameWindow.to)})${b.sameWindow.backtestInTradeAtStart ? "*" : ""}`
            : "no overlap yet",
        ].join(TAB),
      );
    }
  }
  if (rows.some((d) => d.backtest?.sameWindow?.backtestInTradeAtStart)) lines.push("* The backtest was already in a trade when the live record began.");
  lines.push("The backtest has no 2% daily loss cap and no costs. Its Sharpe is annualized from bar returns, the live one from daily returns.");

  const strong = correlations.filter((c) => Math.abs(c.r) >= 0.3).slice(0, 8);
  const label = new Map(rows.map((d) => [d.stats.id, deploymentLabel(d.stats)]));
  lines.push("", "## Correlation of backtest daily returns (|r| >= 0.3, strongest first)");
  if (loading && correlations.length === 0) lines.push("Not computed: backtests were still loading.");
  else if (strong.length === 0) lines.push("No pair reaches 0.3.");
  else for (const c of strong) lines.push(`${label.get(c.a) ?? c.a} ~ ${label.get(c.b) ?? c.b}: ${num(c.r)} over ${c.days} days`);

  lines.push(
    "",
    "## What I want",
    "For each deployment: CUT, KEEP IN PAPER, PROMOTE, or TOO EARLY TO CALL, your confidence, and 1-3 sentences citing the numbers. Don't rank by return. Weigh:",
    "1. Sample size: are the live trades and days enough to tell skill from luck? If not, say roughly how many more trades or weeks you'd need.",
    "2. Live vs backtest: do the live win rate, trade pace and return track the backtest? The same-window column runs both on the same bars, so a gap there is execution (delayed data, fills, timing), not the market, unless marked *.",
    "3. Drawdown: is the live drawdown within what the backtest shows is normal, or a sign it has stopped working?",
    "4. Correlation: don't promote several versions of the same bet. In a correlated cluster, or on the same underlying, promote at most one and say which.",
    "5. Real money: would slippage, commissions, shorting or real-time data instead of delayed break it?",
    "State your uncertainty. Calling something too early is a valid answer; don't force a verdict. End with what to promote first, if anything, at what size, and what evidence would change your mind.",
  );

  return lines.join("\n");
}
