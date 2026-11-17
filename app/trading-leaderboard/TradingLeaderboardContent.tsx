"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Check, ChevronDown, MessageSquareText } from "lucide-react";
import ClientOnly from "@/app/lib/ClientOnly";
import { Bento } from "@/app/components/ui/bento";
import { Button } from "@/app/components/ui/button";
import { createClient } from "@/utils/supabase/client";
import { STARTING_CAPITAL, formatAge, mergeCurves, niceScale, summarize, type EquityCurveRow, type EquitySummary } from "@/app/lib/tradingEquity";
import { deploymentDetails } from "@/app/lib/deploymentDetails";
import { tradingStats } from "@/app/lib/tradingStats";
import { backtestReference, correlations, parsePriceCsv, type BacktestReference } from "@/app/lib/backtestReference";
import { buildLeaderboardPrompt } from "@/app/lib/leaderboardPrompt";
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
import { CLAUDE_NEW_CHAT, claudePrefillUrl } from "@/app/lib/claudeLink";

const REFRESH_MS = 60_000;

/**
 * One color per deployment, in this order so that no two neighbors in the
 * legend are confusable under color-blindness (checked with the dataviz
 * validator in both themes). The account can't hold more than eight 12%
 * allocations; any beyond that fall back to muted rather than repeating a hue.
 */
const SERIES_COLORS = [
  "var(--ds-color-track-4)",
  "var(--ds-color-track-6)",
  "var(--ds-color-track-2)",
  "var(--ds-color-accent-solid)",
  "var(--ds-color-track-3)",
  "var(--ds-color-ansi-bright-yellow)",
  "var(--ds-color-track-1)",
  "var(--ds-color-track-5)",
];
const colorAt = (i: number) => SERIES_COLORS[i] ?? "var(--ds-color-text-muted)";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
// Rounded before the sign is chosen, so -0.001 reads +0.00% rather than −0.00%.
const signedPct = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return `${r >= 0 ? "+" : "−"}${Math.abs(r).toFixed(2)}%`;
};

const ET: Intl.DateTimeFormatOptions = { timeZone: "America/New_York" };
const dayFormat = new Intl.DateTimeFormat("en-US", { ...ET, month: "short", day: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-US", { ...ET, hour: "numeric" });
const fullFormat = new Intl.DateTimeFormat("en-US", { ...ET, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const DAY_MS = 86_400_000;
function axisTime(t: number, spanMs: number): string {
  if (spanMs <= DAY_MS) return timeFormat.format(t);
  if (spanMs <= 7 * DAY_MS) return `${dayFormat.format(t)}, ${timeFormat.format(t)}`;
  return dayFormat.format(t);
}

interface TooltipEntry {
  dataKey?: unknown;
  value?: unknown;
  color?: string;
}

function EquityTooltip({ active, label, payload, labels }: { active?: boolean; label?: unknown; payload?: readonly TooltipEntry[]; labels: Map<string, string> }) {
  if (!active || !payload?.length || typeof label !== "number") return null;
  const rows = [...payload].sort((a, b) => Number(b.value) - Number(a.value));
  return (
    <div className="rounded-lg border border-line-strong bg-surface-overlay px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 text-ink-muted">{fullFormat.format(label)} ET</div>
      {rows.map((r) => (
        <div key={String(r.dataKey)} className="flex items-center gap-2 py-1">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} />
          <span className="text-ink-primary">{labels.get(String(r.dataKey))}</span>
          <span className="ml-auto pl-4 font-medium tabular-nums text-ink-primary">{money(Number(r.value))}</span>
        </div>
      ))}
    </div>
  );
}

function EquityChart({ curves }: { curves: EquitySummary[] }) {
  const data = useMemo(() => mergeCurves(curves), [curves]);
  const labels = useMemo(() => new Map(curves.map((c) => [c.id, c.label])), [curves]);
  const scale = useMemo(() => niceScale([STARTING_CAPITAL, ...curves.flatMap((c) => c.points.map(([, v]) => v))]), [curves]);

  if (data.length < 2) {
    return <p className="flex h-full items-center justify-center text-sm text-ink-muted">The curves start once a second bar has been reported.</p>;
  }
  const span = data[data.length - 1].t - data[0].t;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--ds-color-border-subtle)" />
        <XAxis
          dataKey="t"
          type="number"
          domain={["dataMin", "dataMax"]}
          tickFormatter={(t: number) => axisTime(t, span)}
          minTickGap={56}
          tick={{ fill: "var(--ds-color-text-muted)", fontSize: 11 }}
          stroke="var(--ds-color-border-strong)"
          tickLine={false}
        />
        <YAxis
          domain={scale.domain}
          ticks={scale.ticks}
          tickFormatter={money}
          width={62}
          tick={{ fill: "var(--ds-color-text-muted)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <ReferenceLine y={STARTING_CAPITAL} stroke="var(--ds-color-text-muted)" strokeDasharray="4 4" />
        <Tooltip
          cursor={{ stroke: "var(--ds-color-border-strong)" }}
          isAnimationActive={false}
          content={(props) => <EquityTooltip active={props.active} label={props.label} payload={props.payload as readonly TooltipEntry[] | undefined} labels={labels} />}
        />
        {curves.map((c, i) => (
          <Line key={c.id} dataKey={c.id} name={c.label} stroke={colorAt(i)} strokeWidth={2} dot={false} activeDot={{ r: 4 }} type="linear" isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** The chart's height limits while dragging its handle, in px. */
const CHART_MIN = 200;
const CHART_MAX = 1600;
const CHART_STEP = 24;
const HEIGHT_KEY = "trading-leaderboard-chart-height";
const clampHeight = (h: number) => Math.round(Math.min(CHART_MAX, Math.max(CHART_MIN, h)));

/**
 * The chart's height: null until the reader drags the handle (the chart then
 * fills what the table leaves), then a fixed px height, remembered on this
 * device. Storage can be unavailable; the page works the same without it.
 * The view only mounts once the curves have loaded in the browser, so reading
 * storage on the first render can't cause a hydration mismatch.
 */
function useChartHeight() {
  const [height, setHeight] = useState<number | null>(() => {
    try {
      const saved = Number(localStorage.getItem(HEIGHT_KEY));
      return saved >= CHART_MIN ? clampHeight(saved) : null;
    } catch {
      return null;
    }
  });
  const save = (h: number | null) => {
    try {
      if (h === null) localStorage.removeItem(HEIGHT_KEY);
      else localStorage.setItem(HEIGHT_KEY, String(h));
    } catch {}
  };
  return { height, setHeight, save };
}

/**
 * A grip under the chart: drag it (mouse, pen or finger) up or down to resize
 * the chart, or focus it and use the arrow keys. Double-click resets it.
 */
function ChartResizeHandle({
  frame,
  height,
  onResize,
  onCommit,
}: {
  frame: React.RefObject<HTMLDivElement | null>;
  height: number | null;
  onResize: (h: number) => void;
  onCommit: (h: number | null) => void;
}) {
  const drag = useRef<{ y: number; h: number; last: number } | null>(null);
  const current = () => height ?? frame.current?.getBoundingClientRect().height ?? CHART_MIN;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const h = current();
    drag.current = { y: e.clientY, h, last: h };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const h = clampHeight(drag.current.h + e.clientY - drag.current.y);
    drag.current.last = h;
    onResize(h);
  };
  const onPointerEnd = () => {
    if (!drag.current) return;
    onCommit(drag.current.last);
    drag.current = null;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const by: Record<string, number> = { ArrowDown: CHART_STEP, ArrowUp: -CHART_STEP, PageDown: CHART_STEP * 5, PageUp: -CHART_STEP * 5 };
    let h: number | null = null;
    if (e.key in by) h = clampHeight(current() + by[e.key]);
    else if (e.key === "Home") h = CHART_MIN;
    else if (e.key === "End") h = CHART_MAX;
    if (h === null) return;
    e.preventDefault();
    onResize(h);
    onCommit(h);
  };

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize the chart"
      aria-valuemin={CHART_MIN}
      aria-valuemax={CHART_MAX}
      aria-valuenow={Math.round(height ?? CHART_MIN)}
      tabIndex={0}
      title="Drag to resize. Double-click to reset."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onCommit(null)}
      // Tall enough to hit with a thumb; touch-none so a drag resizes instead of scrolling the page.
      className="group -mb-3 flex h-11 shrink-0 cursor-row-resize touch-none select-none items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-color-accent-solid)]"
    >
      <span className="h-1.5 w-12 rounded-full bg-line-strong transition-colors group-hover:bg-ink-muted group-active:bg-ink-muted" />
    </div>
  );
}

/** A trading_trade_ledger() row: the deployment's closed trades and time in market. */
type LedgerRow = { deployment_id: string; bars: number; bars_in_position: number; trades: [number, number, number, number, number][] };

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

const chip = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";

/** In a table cell the thin-sample chip says how far along it is, which is the threshold itself. */
function sampleText(sample: Sample, trades: number, tradingDays: number, short: boolean): string {
  if (!short || sample.status !== "insufficient") return sample.label;
  return trades < SAMPLE.minTrades ? `${trades}/${SAMPLE.minTrades} trades` : `${tradingDays}/${SAMPLE.minDays} days`;
}

const SHORT_DIVERGENCE: Record<Divergence["status"], string> = {
  worse: "Worse",
  "in-line": "In line",
  better: "Better",
  "too-early": "Too early",
  "no-backtest": "No backtest",
  unavailable: "No data",
};

function SampleChip({ sample, text }: { sample: Sample; text?: string }) {
  const tone =
    sample.status === "insufficient"
      ? "bg-surface-sunken text-ink-muted"
      : sample.status === "negative"
        ? "bg-danger text-ink-on-primary"
        : sample.status === "edge"
          ? "border border-success text-success"
          : "border border-line-strong text-ink-primary";
  return (
    <span className={`${chip} ${tone}`} title={sample.detail}>
      {text ?? sample.label}
    </span>
  );
}

function DivergenceChip({ divergence, short = false }: { divergence: Divergence | null; short?: boolean }) {
  if (!divergence) return <span className="text-xs text-ink-muted">Loading&hellip;</span>;
  const tone =
    divergence.status === "worse"
      ? "bg-danger text-ink-on-primary"
      : divergence.status === "in-line"
        ? "border border-success text-success"
        : divergence.status === "better"
          ? "border border-line-strong text-ink-primary"
          : "bg-surface-sunken text-ink-muted";
  return (
    <span className={`${chip} ${tone}`} title={divergence.detail}>
      {short ? SHORT_DIVERGENCE[divergence.status] : divergence.label}
    </span>
  );
}

const fmt = (n: number | null | undefined, places = 2, suffix = "") =>
  n === null || n === undefined || Number.isNaN(n) ? "–" : n === Infinity ? "∞" : `${n.toFixed(places)}${suffix}`;
const fmtSignedPct = (n: number | null | undefined, places = 2) => {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  const r = Math.round(n * 10 ** places) / 10 ** places;
  return `${r >= 0 ? "+" : "−"}${Math.abs(r).toFixed(places)}%`;
};
const fmtMoney = (n: number | null | undefined) => (n === null || n === undefined ? "–" : `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`);

/**
 * The full go-live statistics, live beside the backtest, for the row's
 * detail panel. Live figures that don't mean anything yet are greyed, with
 * the threshold that would make them count.
 */
function GoLiveStats({ go, backtest, value, position }: { go: GoLive; backtest: BacktestReference | null | undefined; value: number; position: string }) {
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
      <div className="flex flex-col gap-1.5">
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

function returnClass(pct: number): string {
  if (pct > 0) return "text-success";
  if (pct < 0) return "text-danger";
  return "text-ink-primary";
}

/** What the page shows, given the curves. Colors follow each curve's position in `curves`. */
export function TradingLeaderboardView({
  curves,
  now,
  goLive,
  backtests,
}: {
  curves: EquitySummary[];
  now: number;
  goLive: Map<string, GoLive>;
  backtests: Map<string, BacktestReference | null>;
}) {
  const colors = new Map(curves.map((c, i) => [c.id, colorAt(i)]));
  // Deployments with enough data first, by return; the rest below a divider,
  // so a lucky handful of trades never tops the board.
  const byReturn = [...curves].sort((a, b) => b.returnPct - a.returnPct);
  const enough = (c: EquitySummary) => goLive.get(c.id)?.sample.status !== "insufficient";
  const ranked = [...byReturn.filter(enough), ...byReturn.filter((c) => !enough(c))];
  const firstThin = ranked.findIndex((c) => !enough(c));
  const headCell = "px-3 py-2 font-medium";
  // The deployment column stays put while the numbers scroll past it, on the
  // card's own surface so they slide underneath rather than through it.
  const pinned = "sticky left-0 z-[1] bg-surface-raised";
  const { height, setHeight, save } = useChartHeight();
  const frame = useRef<HTMLDivElement>(null);
  const details = useMemo(() => new Map(curves.map((c) => [c.id, deploymentDetails(c)])), [curves]);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <div className="flex flex-1 flex-col gap-4">
      {/* Until the handle is dragged, the chart takes whatever height the
          table leaves, never under 340px; after, the height dragged to. */}
      <Bento size="3" className={`flex flex-col ${height === null ? "flex-1" : ""}`}>
        <div className="mb-3 flex shrink-0 flex-wrap gap-x-4 gap-y-1">
          {curves.map((c) => (
            <span key={c.id} className="flex items-center gap-2 text-xs text-ink-primary">
              <span className="h-0.5 w-4 rounded-full" style={{ background: colors.get(c.id) }} />
              {c.label}
            </span>
          ))}
        </div>
        <div ref={frame} className={height === null ? "min-h-[340px] flex-1" : "shrink-0"} style={height === null ? undefined : { height }}>
          <ClientOnly>
            <EquityChart curves={curves} />
          </ClientOnly>
        </div>
        <ChartResizeHandle
          frame={frame}
          height={height}
          onResize={setHeight}
          onCommit={(h) => {
            setHeight(h);
            save(h);
          }}
        />
      </Bento>

      {/* Every column, at its natural width: on a narrow screen the table is
          wider than the card and scrolls sideways natively. Radix's Card clips
          its own overflow, so the scrolling box is this div inside it, not
          the card. min-w-full keeps the table filling the card when it fits. */}
      <Bento size="1">
        <div className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
        <table className="w-max min-w-full whitespace-nowrap text-sm">
          <thead>
            <tr className="border-b border-line-subtle text-right text-xs text-ink-muted">
              <th className={`${headCell} ${pinned} text-left`}>Deployment</th>
              <th className={`${headCell} text-left`} title="Whether the live trades are what the backtest would produce">vs backtest</th>
              <th className={headCell}>Return</th>
              <th className={`${headCell} text-left`} title={`Enough data needs ${SAMPLE.minTrades} closed trades and ${SAMPLE.minDays} trading days`}>Sample</th>
              <th className={headCell}>Trades</th>
              <th className={headCell} title="Gross profit over gross loss">Profit factor</th>
              <th className={headCell} title="Average P&L per trade, as a percent of the equity it was sized from">Per trade</th>
              <th className={headCell}>Max drawdown</th>
              <th className={headCell}>Updated</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((c, index) => {
              const d = details.get(c.id)!;
              const isOpen = open.has(c.id);
              const go = goLive.get(c.id);
              const thin = go?.sample.status === "insufficient";
              const tradeOk = go?.sample.tradeStatsMeaningful ?? false;
              // A thin sample's results are shown, but muted: they aren't evidence yet.
              const weak = "text-ink-muted";
              return (
              <Fragment key={c.id}>
              {index === firstThin && (
                <tr className="border-b border-line-subtle">
                  <td colSpan={9} className="p-0">
                    <div className="sticky left-0 w-[calc(100vw-5rem)] max-w-2xl whitespace-normal px-3 pb-2 pt-4 text-left text-xs text-ink-muted">
                      <span className="font-medium text-ink-primary">{firstThin === 0 ? "None has enough data yet." : "Not enough data yet."}</span> Under {SAMPLE.minTrades} closed trades or {SAMPLE.minDays} trading days, results can&apos;t be told from luck
                      {firstThin === 0 ? ", so the returns below are a record, not a ranking." : ", so these aren't ranked against the rows above."}
                    </div>
                  </td>
                </tr>
              )}
              <tr className={`text-right tabular-nums text-ink-primary ${isOpen ? "" : "border-b border-line-subtle"}`}>
                <td className={`px-3 py-3 text-left ${pinned}`}>
                  <div className="flex items-center gap-2 font-medium">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colors.get(c.id) }} />
                    {c.label}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggle(c.id)}
                    aria-expanded={isOpen}
                    aria-controls={`details-${c.id}`}
                    className="-my-1 flex min-h-8 items-center gap-1 pl-4 text-xs text-ink-muted hover:text-ink-primary"
                  >
                    {c.strategy}
                    <ChevronDown aria-hidden className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                </td>
                <td className="px-3 py-3 text-left">{go && <DivergenceChip divergence={go.divergence} short />}</td>
                <td className={`px-3 py-3 font-medium ${thin ? weak : returnClass(c.returnPct)}`}>{signedPct(c.returnPct)}</td>
                <td className="px-3 py-3 text-left">
                  {go && <SampleChip sample={go.sample} text={sampleText(go.sample, go.live?.trades ?? c.trades, go.live?.tradingDays ?? 0, true)} />}
                </td>
                <td className="px-3 py-3">
                  {c.trades}
                  {c.trades > 0 && <span className="text-ink-muted"> ({Math.round((c.wins / c.trades) * 100)}% won)</span>}
                </td>
                <td className={`px-3 py-3 ${tradeOk ? "" : weak}`}>{fmt(go?.live?.profitFactor)}</td>
                <td className={`px-3 py-3 ${tradeOk ? "" : weak}`}>{fmtSignedPct(go?.live?.expectancyPct)}</td>
                <td className="px-3 py-3">{c.maxDrawdownPct.toFixed(2)}%</td>
                <td className="px-3 py-3 text-ink-muted">{formatAge(now - c.latestAt)}</td>
              </tr>
              {isOpen && (
                <tr id={`details-${c.id}`} className="border-b border-line-subtle last:border-0">
                  <td colSpan={9} className="p-0">
                    {/* Pinned to the card's left edge and no wider than the
                        screen, so on a phone it reads without scrolling sideways. */}
                    <div className="sticky left-0 w-[calc(100vw-5rem)] max-w-2xl whitespace-normal px-3 pb-3 pl-7 text-left text-xs text-ink-muted">
                      {d.description && <p className="mb-2 text-sm text-ink-primary">{d.description}</p>}
                      {(d.params.length > 0 || d.sides) && (
                        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                          {d.params.map((p) => (
                            <Fragment key={p.name}>
                              <dt>{p.name}</dt>
                              <dd className="font-medium tabular-nums text-ink-primary">{p.value}</dd>
                            </Fragment>
                          ))}
                          {d.sides && (
                            <>
                              <dt>Trades</dt>
                              <dd className="font-medium text-ink-primary">{d.sides}</dd>
                            </>
                          )}
                          <dt>Bars</dt>
                          <dd className="font-medium text-ink-primary">{c.label.split(" ").pop()}</dd>
                        </dl>
                      )}
                      {go && <GoLiveStats go={go} backtest={backtests.has(c.id) ? backtests.get(c.id) : undefined} value={c.value} position={c.position} />}
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
              );
            })}
          </tbody>
        </table>
        </div>
      </Bento>
    </div>
  );
}

type Pnl = { realized: number; open: number };
type SnapshotPnl = { deployment_id: string; bar_time: string; realized_pnl: number; unrealized_pnl: number };

/**
 * Realized P&L since each deployment's first report, and its open P&L now,
 * from the snapshots at its first and latest bar. The curves RPC doesn't
 * return P&L, but the snapshot table is public to read.
 */
async function loadPnl(supabase: NonNullable<ReturnType<typeof createClient>>, rows: EquityCurveRow[]): Promise<Map<string, Pnl>> {
  const times = [...new Set(rows.flatMap((r) => [r.starting_at, r.latest_at]))];
  const { data, error } = await supabase
    .from("trading_equity_snapshots")
    .select("deployment_id, bar_time, realized_pnl, unrealized_pnl")
    .in("deployment_id", rows.map((r) => r.deployment_id))
    .in("bar_time", times);
  const out = new Map<string, Pnl>();
  if (error || !data) return out;
  const at = (id: string, iso: string) => (data as SnapshotPnl[]).find((s) => s.deployment_id === id && Date.parse(s.bar_time) === Date.parse(iso));
  for (const r of rows) {
    const first = at(r.deployment_id, r.starting_at);
    const last = at(r.deployment_id, r.latest_at);
    if (first && last) out.set(r.deployment_id, { realized: last.realized_pnl - first.realized_pnl, open: last.unrealized_pnl });
  }
  return out;
}

/**
 * A reference backtest for each deployment not already done, from the app's
 * own datasets (public/data, about 0.3 to 0.8 MB each). Run in the background
 * after the leaderboard loads so the prompt can be built inside the click:
 * Safari blocks the new tab and the clipboard if the click waits on a fetch.
 * Skipped when the browser asks to save data.
 */
async function loadBacktests(rows: EquityCurveRow[], have: ReadonlySet<string>, onOne: (id: string, ref: BacktestReference | null) => void, isCancelled: () => boolean) {
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  if (saveData) return;
  const manifest = (await fetch("/data/manifest.json").then((r) => (r.ok ? r.json() : null)).catch(() => null)) as { files: { file: string; symbol: string; timeframe: string }[] } | null;
  for (const row of rows) {
    if (isCancelled()) return;
    if (have.has(row.deployment_id)) continue;
    const timeframe = row.bar_interval.replace("min", "m");
    const entry = manifest?.files.find((f) => f.symbol === row.symbol && f.timeframe === timeframe);
    const s = summarize(row);
    const details = deploymentDetails(s);
    let ref: BacktestReference | null = null;
    if (entry && details.sides) {
      const text = await fetch(`/data/${entry.file}`).then((r) => (r.ok ? r.text() : null)).catch(() => null);
      if (isCancelled()) return;
      if (text) {
        ref = backtestReference(parsePriceCsv(text), {
          strategyId: s.strategyId,
          values: details.values,
          shorts: details.sides === "Long and short",
          dataset: entry.file,
          live: s.points,
        });
      }
    }
    onOne(row.deployment_id, ref);
    // Let the page paint between runs.
    await new Promise((r) => setTimeout(r, 0));
  }
}

type AnalyzeStatus = { tone: "ok" | "warn"; text: string } | null;

/**
 * Opens a new Claude chat with the analysis prompt typed in, and copies the
 * same prompt to the clipboard. Both happen inside the click, with the prompt
 * already built from what the page holds, so popup blockers and Safari's
 * clipboard rules allow them. A prompt too long for the URL opens an empty
 * chat and relies on the clipboard.
 */
function AnalyzeInClaude({ buildPrompt, disabled }: { buildPrompt: () => { prompt: string; backtestsPending: boolean } | null; disabled: boolean }) {
  const [status, setStatus] = useState<AnalyzeStatus>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const onClick = () => {
    const built = buildPrompt();
    if (!built) return;
    const { prompt, backtestsPending } = built;
    const url = claudePrefillUrl(prompt);
    const copying = navigator.clipboard?.writeText
      ? navigator.clipboard.writeText(prompt).then(() => true, () => false)
      : Promise.resolve(false);
    window.open(url ?? CLAUDE_NEW_CHAT, "_blank", "noopener,noreferrer");
    void copying.then((copied) => {
      const pending = backtestsPending ? " The reference backtests were still loading, so the prompt says which are missing." : "";
      let next: AnalyzeStatus;
      if (url && copied) next = { tone: "ok", text: `Opened Claude with the prompt filled in; it's on your clipboard too.${pending}` };
      else if (url) next = { tone: "ok", text: `Opened Claude with the prompt filled in. (Copying to the clipboard didn't work.)${pending}` };
      else if (copied) next = { tone: "warn", text: `The prompt is too long to fill in through the link, so Claude opened empty. It's on your clipboard: paste it in and send.${pending}` };
      else next = { tone: "warn", text: "The prompt is too long to fill in through the link and copying it didn't work. Allow clipboard access for this site and try again." };
      setStatus(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setStatus(null), 12_000);
    });
  };

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
      <Button
        variant="primary"
        size="md"
        onClick={onClick}
        disabled={disabled}
        title="Open a new Claude chat asking which strategies to cut, keep in paper or move to real money, with the current stats filled in"
        className="w-full sm:w-auto"
      >
        {status?.tone === "ok" ? <Check className="size-4" /> : <MessageSquareText className="size-4" />}
        Analyze in Claude
      </Button>
      <p role="status" aria-live="polite" className={`max-w-sm text-xs sm:text-right ${status?.tone === "warn" ? "text-ink-primary" : "text-ink-muted"}`}>
        {status?.text}
      </p>
    </div>
  );
}

export default function TradingLeaderboardContent() {
  const [curves, setCurves] = useState<EquitySummary[] | null>(null);
  const [rows, setRows] = useState<EquityCurveRow[] | null>(null);
  const [pnl, setPnl] = useState<Map<string, Pnl>>(new Map());
  const [backtests, setBacktests] = useState<Map<string, BacktestReference | null>>(new Map());
  // Null until loaded, and if the ledger function isn't there (the migration
  // hasn't run): the table then falls back to the trade count alone.
  const [ledger, setLedger] = useState<Map<string, LedgerRow> | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    async function load() {
      const { data, error: rpcError } = supabase ? await supabase.rpc("trading_equity_curves") : { data: null, error: { message: "Supabase isn't configured here." } };
      if (cancelled) return;
      if (rpcError) {
        setError(rpcError.message);
        return;
      }
      setError(null);
      const loaded = (data ?? []) as EquityCurveRow[];
      setRows(loaded);
      setCurves(loaded.map(summarize));
      setLoadedAt(Date.now());
      if (supabase && loaded.length > 0) {
        const [next, trades] = await Promise.all([loadPnl(supabase, loaded), supabase.rpc("trading_trade_ledger")]);
        if (cancelled) return;
        setPnl(next);
        setLedger(trades.error || !trades.data ? null : new Map((trades.data as LedgerRow[]).map((r) => [r.deployment_id, r])));
      }
    }
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Backtests for deployments not yet done, whenever the set of deployments changes.
  const rowIds = rows?.map((r) => r.deployment_id).join(",") ?? "";
  const backtestsRef = useRef(backtests);
  backtestsRef.current = backtests;
  useEffect(() => {
    if (!rows || rows.length === 0) return;
    let cancelled = false;
    void loadBacktests(
      rows,
      new Set(backtestsRef.current.keys()),
      (id, ref) => setBacktests((prev) => new Map(prev).set(id, ref)),
      () => cancelled,
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowIds]);

  const goLive = useMemo(() => {
    const out = new Map<string, GoLive>();
    for (const r of rows ?? []) {
      const entry = ledger?.get(r.deployment_id);
      out.set(r.deployment_id, goLiveFor(r, ledger ? (entry ?? { deployment_id: r.deployment_id, bars: 0, bars_in_position: 0, trades: [] }) : undefined, backtests.has(r.deployment_id) ? backtests.get(r.deployment_id) : undefined));
    }
    return out;
  }, [rows, ledger, backtests]);

  const buildPrompt = useCallback(() => {
    if (!rows || rows.length === 0) return null;
    const stats = tradingStats(rows, Date.now());
    const done = new Map([...backtests].filter(([, ref]) => ref !== null) as [string, BacktestReference][]);
    const deployments = stats.deployments.map((s) => {
      const details = deploymentDetails({ id: s.id, strategyId: s.strategy.id, symbol: s.symbol, interval: s.barInterval });
      const go = goLive.get(s.id);
      return {
        stats: s,
        values: details.values,
        pnl: pnl.get(s.id) ?? null,
        backtest: backtests.has(s.id) ? backtests.get(s.id)! : undefined,
        live: go?.live ?? null,
        sample: go?.sample ?? null,
        divergence: go?.divergence ?? null,
      };
    });
    const corr = correlations(new Map([...done].map(([id, ref]) => [id, ref.dailyReturns])));
    return {
      prompt: buildLeaderboardPrompt({ deployments, correlations: corr, asOf: Date.now() }),
      backtestsPending: deployments.some((d) => d.backtest === undefined),
    };
  }, [rows, pnl, backtests, goLive]);

  return (
    <main className="flex w-full flex-1 flex-col px-4 py-4">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink-primary">Trading Leaderboard</h1>
        <AnalyzeInClaude buildPrompt={buildPrompt} disabled={!rows || rows.length === 0} />
      </header>

      {error && curves === null && <Bento size="3" className="text-sm text-ink-muted">Couldn&apos;t load the curves: {error}</Bento>}
      {!error && curves === null && <Bento size="3" className="text-sm text-ink-muted">Loading&hellip;</Bento>}
      {curves?.length === 0 && <Bento size="3" className="text-sm text-ink-muted">No deployment has reported in the last 7 days.</Bento>}
      {curves && curves.length > 0 && <TradingLeaderboardView curves={curves} now={loadedAt} goLive={goLive} backtests={backtests} />}
    </main>
  );
}
