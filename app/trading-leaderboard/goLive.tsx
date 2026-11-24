"use client";

// What the Trading Leaderboard says about whether a deployment is ready for
// real money: the go-live verdicts, their chips, and the full statistics
// table, shared by the leaderboard's rows and its deployment panel.

import { STARTING_CAPITAL, summarize, type EquityCurveRow } from "@/app/lib/tradingEquity";
import type { BacktestReference } from "@/app/lib/backtestReference";
import type { LedgerRow } from "@/app/lib/tradingHistorySource";
import {
  SAMPLE,
  UNAVAILABLE_DIVERGENCE,
  compareToBacktest,
  performanceStats,
  sampleStatus,
  tradesFromLedger,
  type ClosedTrade,
  type Divergence,
  type PerformanceStats,
  type Sample,
} from "@/app/lib/tradeStats";

/** A trading_trade_ledger() row: the deployment's closed trades and time in market. */
export type { LedgerRow };

/** Everything the table and the prompt say about whether a deployment is ready for real money. */
export interface GoLive {
  /** Null when the trade ledger couldn't be read; the sample still comes from the trade count. */
  live: PerformanceStats | null;
  sample: Sample;
  /** Null while the backtest is still loading. */
  divergence: Divergence | null;
}

export function goLiveFor(row: EquityCurveRow, ledger: LedgerRow | undefined, backtest: BacktestReference | null | undefined): GoLive {
  const s = summarize(row);
  // Real dollars: the curve is scaled to a $10,000 base for the chart.
  const scale = row.starting_equity / STARTING_CAPITAL;
  const points = s.points.map(([t, v]) => [t, v * scale] as [number, number]);
  const trades: ClosedTrade[] | null = ledger ? tradesFromLedger(ledger.trades) : null;
  const live = trades ? performanceStats({ trades, points, bars: ledger!.bars, barsInPosition: ledger!.bars_in_position }) : null;
  const tradingDays = new Set(points.map(([t]) => new Date(t - 5 * 3_600_000).toISOString().slice(0, 10))).size;
  const sample = sampleStatus(live ?? { trades: s.trades, tradingDays, tStat: null });
  // Null only while the backtest is loading; no ledger is its own answer.
  const divergence = !trades ? UNAVAILABLE_DIVERGENCE : backtest === undefined ? null : compareToBacktest(trades, backtest ? backtest.closedTrades : null);
  return { live, sample, divergence };
}

export const chip = "inline-flex h-5 items-center rounded-full px-2 text-12 font-medium";

/** In a table cell the thin-sample chip says how far along it is, which is the threshold itself. */
export function sampleText(sample: Sample, trades: number, tradingDays: number, short: boolean): string {
  if (!short || sample.status !== "insufficient") return sample.label;
  return trades < SAMPLE.minTrades ? `${trades}/${SAMPLE.minTrades} trades` : `${tradingDays}/${SAMPLE.minDays} days`;
}

export const SHORT_DIVERGENCE: Record<Divergence["status"], string> = {
  worse: "Worse",
  "in-line": "In line",
  better: "Better",
  "too-early": "Too early",
  "no-backtest": "No backtest",
  unavailable: "No data",
};

/**
 * A status chip: neutral, with a dot carrying the signal (red bad, green
 * good, none for "can't tell yet"), so a column of them reads at a glance
 * without the color outshouting the P&L numbers beside it.
 */
function StatusChip({ dot, quiet = false, title, children }: { dot?: "danger" | "success" | "muted"; quiet?: boolean; title?: string; children: React.ReactNode }) {
  const tone = quiet ? "bg-surface-sunken text-ink-muted" : "border border-line-subtle bg-surface-raised text-ink-primary";
  const dotColor = dot === "danger" ? "bg-danger" : dot === "success" ? "bg-success" : "bg-ink-muted";
  return (
    <span className={`${chip} gap-2 ${tone}`} title={title}>
      {dot && <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${dotColor}`} />}
      {children}
    </span>
  );
}

export function SampleChip({ sample, text }: { sample: Sample; text?: string }) {
  const dot = sample.status === "negative" ? "danger" : sample.status === "edge" ? "success" : sample.status === "insufficient" ? undefined : "muted";
  return (
    <StatusChip dot={dot} quiet={sample.status === "insufficient"} title={sample.detail}>
      {text ?? sample.label}
    </StatusChip>
  );
}

export function DivergenceChip({ divergence, short = false }: { divergence: Divergence | null; short?: boolean }) {
  if (!divergence) return <span className="text-12 text-ink-muted">Loading&hellip;</span>;
  const dot = divergence.status === "worse" ? "danger" : divergence.status === "in-line" ? "success" : divergence.status === "better" ? "muted" : undefined;
  const quiet = dot === undefined;
  return (
    <StatusChip dot={dot} quiet={quiet} title={divergence.detail}>
      {short ? SHORT_DIVERGENCE[divergence.status] : divergence.label}
    </StatusChip>
  );
}

export const fmt = (n: number | null | undefined, places = 2, suffix = "") =>
  n === null || n === undefined || Number.isNaN(n) ? "–" : n === Infinity ? "∞" : `${n.toFixed(places)}${suffix}`;
export const fmtSignedPct = (n: number | null | undefined, places = 2) => {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  const r = Math.round(n * 10 ** places) / 10 ** places;
  return `${r >= 0 ? "+" : "−"}${Math.abs(r).toFixed(places)}%`;
};
export const fmtMoney = (n: number | null | undefined) => (n === null || n === undefined ? "–" : `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`);

/**
 * The full go-live statistics, live beside the backtest, for the row's
 * detail panel. Live figures that don't mean anything yet are greyed, with
 * the threshold that would make them count.
 */
export function GoLiveStats({ go, backtest, value, position }: { go: GoLive; backtest: BacktestReference | null | undefined; value: number; position: string }) {
  const { live, sample, divergence } = go;
  const b = backtest?.stats ?? null;
  const tradeOk = sample.tradeStatsMeaningful;
  const dailyOk = sample.dailyStatsMeaningful;
  type Row = [label: string, live: string, backtest: string, meaningful: boolean];
  const rows: Row[] = live
    ? [
        ["Trades (won/lost)", `${live.trades} (${live.wins}/${live.losses})`, b ? String(b.trades) : "–", true],
        ["Trades per month", fmt(live.tradesPerMonth, 1), fmt(backtest?.tradesPerMonth, 1), tradeOk],
        ["Win rate", fmt(live.winRatePct, 0, "%"), fmt(b?.winRatePct, 0, "%"), tradeOk],
        ["Profit factor", fmt(live.profitFactor), fmt(b?.profitFactor), tradeOk],
        ["Expectancy per trade", live.trades ? `${fmtSignedPct(live.expectancyPct)} · ${fmtMoney(live.expectancy)} · ${fmt(live.expectancyR)}R` : "–", fmtSignedPct(b?.expectancyPct), tradeOk],
        ["Average win / loss", `${fmtSignedPct(live.avgWinPct)} / ${fmtSignedPct(live.avgLossPct)}`, `${fmtSignedPct(b?.avgWinPct)} / ${fmtSignedPct(b?.avgLossPct)}`, tradeOk],
        ["Win / loss size", fmt(live.winLossRatio), fmt(b?.winLossRatio), tradeOk],
        ["Worst trade", live.worstTrade ? `${fmtSignedPct(live.worstTrade.pct)} · ${fmtMoney(live.worstTrade.pnl)}` : "–", fmtSignedPct(b?.worstTrade?.pct), true],
        ["Longest losing streak", String(live.longestLosingStreak), b ? String(b.longestLosingStreak) : "–", true],
        ["Net P&L without best trade", fmtMoney(live.netWithoutBest), "", tradeOk],
        ["Profit from top 3 wins", fmt(live.topThreeSharePct, 0, "%"), fmt(b?.topThreeSharePct, 0, "%"), tradeOk],
        ["Time in market", fmt(live.exposurePct, 0, "%"), fmt(b?.exposurePct, 0, "%"), true],
        ["Max drawdown", `${fmt(live.maxDrawdownPct, 2, "%")} · ${fmtMoney(live.maxDrawdownDollars)}`, fmt(b?.maxDrawdownPct, 1, "%"), true],
        ["Drawdown now", `${fmt(live.currentDrawdownPct, 2, "%")}${live.drawdownDays > 0 ? ` · ${fmt(live.drawdownDays, 1)} days` : ""}`, "", true],
        ["Time in drawdown", fmt(live.timeInDrawdownPct, 0, "%"), fmt(b?.timeInDrawdownPct, 0, "%"), true],
        ["Sharpe / Sortino", `${fmt(live.sharpe)} / ${fmt(live.sortino)}`, `${fmt(b?.sharpe)} / ${fmt(b?.sortino)}`, dailyOk],
        ["Mean trade t-stat", fmt(live.tStat, 1), fmt(b?.tStat, 1), tradeOk],
        ["Value · position", `${fmtMoney(value)} · ${position}`, "", true],
      ]
    : [["Value · position", `${fmtMoney(value)} · ${position}`, "", true]];

  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <p>
          <SampleChip sample={sample} /> <span className="text-ink-primary">{sample.detail}</span>
        </p>
        <p>
          <DivergenceChip divergence={divergence} />{" "}
          <span className={divergence?.status === "worse" ? "font-medium text-danger" : "text-ink-primary"}>
            {divergence?.detail ?? "The reference backtest is still loading."}
          </span>
        </p>
      </div>
      {!live && <p>Trade-level statistics couldn&apos;t be loaded, so only the trade count is shown.</p>}
      <table className="w-full tabular-nums">
        <thead>
          <tr className="text-left text-ink-muted">
            <th className="py-1 pr-3 font-medium">Statistic</th>
            <th className="py-1 pr-3 text-right font-medium">Live</th>
            <th className="py-1 text-right font-medium">Backtest</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, l, bt, ok]) => (
            <tr key={label} className="border-t border-line-subtle">
              <td className="py-1 pr-3">{label}</td>
              <td className={`py-1 pr-3 text-right font-medium ${ok ? "text-ink-primary" : "text-ink-muted opacity-70"}`} title={ok ? undefined : "Not meaningful yet: see the sample above"}>
                {l}
              </td>
              <td className="py-1 text-right text-ink-primary">{bt}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Greyed live figures aren&apos;t meaningful yet: trade statistics need {SAMPLE.minTrades} closed trades, Sharpe and Sortino {SAMPLE.minDays} trading days.
        R takes the average loss as 1R, since the deployments have no stop. The backtest runs the same strategy and sizing on {backtest ? `${fmt(backtest.years, 1)} years of` : "the app's"} historical data, without costs.
      </p>
    </div>
  );
}
