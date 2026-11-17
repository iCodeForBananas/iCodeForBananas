"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DropdownMenu, Skeleton } from "@radix-ui/themes";
import { ArrowDown, Check, EllipsisVertical, LineChart as LineChartIcon, MessageSquareText, RotateCw } from "lucide-react";
import ClientOnly from "@/app/lib/ClientOnly";
import BentoPageLayout from "@/app/components/BentoPageLayout";
import { Bento } from "@/app/components/ui/bento";
import { Button } from "@/app/components/ui/button";
import { STARTING_CAPITAL, formatAge, mergeCurves, niceScale, summarize, type EquityCurveRow, type EquitySummary } from "@/app/lib/tradingEquity";
import { deploymentDetails, type DeploymentConfig } from "@/app/lib/deploymentDetails";
import { tradingStats } from "@/app/lib/tradingStats";
import { backtestReference, correlations, parsePriceCsv, type BacktestReference } from "@/app/lib/backtestReference";
import { buildLeaderboardPrompt } from "@/app/lib/leaderboardPrompt";
import { SAMPLE } from "@/app/lib/tradeStats";
import { CLAUDE_NEW_CHAT, claudePrefillUrl } from "@/app/lib/claudeLink";
import { DivergenceChip, SampleChip, fmt, fmtSignedPct, goLiveFor, sampleText, type GoLive, type LedgerRow } from "./goLive";
import { DeploymentPanel } from "./DeploymentPanel";
import { loadEquityCurves, loadSnapshotPnl, loadTradeLedgers } from "@/app/lib/tradingHistorySource";

const REFRESH_MS = 60_000;

/**
 * One color per deployment, in this order so that no two neighbors in the
 * legend are confusable under color-blindness (checked with the dataviz
 * validator in both themes). Past eight the hues come round again, drawn
 * dashed in the chart and as a ring in the table, so no two deployments look
 * the same (the design system has six identity colors; see color.track).
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
const colorAt = (i: number) => SERIES_COLORS[i % SERIES_COLORS.length];
/** Past the eighth deployment the hues repeat, so the repeats are dashed to stay told apart. */
const dashAt = (i: number) => (i < SERIES_COLORS.length ? undefined : "6 3");

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

function EquityChart({ curves, highlight }: { curves: EquitySummary[]; highlight: string | null }) {
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
          tick={{ fill: "var(--ds-color-text-muted)", fontSize: 12 }}
          stroke="var(--ds-color-border-strong)"
          tickLine={false}
        />
        <YAxis
          domain={scale.domain}
          ticks={scale.ticks}
          tickFormatter={money}
          width={62}
          tick={{ fill: "var(--ds-color-text-muted)", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <ReferenceLine y={STARTING_CAPITAL} stroke="var(--ds-color-text-muted)" strokeDasharray="4 4" />
        <Tooltip
          cursor={{ stroke: "var(--ds-color-border-strong)" }}
          isAnimationActive={false}
          content={(props) => <EquityTooltip active={props.active} label={props.label} payload={props.payload as readonly TooltipEntry[] | undefined} labels={labels} />}
        />
        {curves.map((c, i) => [c, i] as const).sort(([a], [b]) => Number(a.id === highlight) - Number(b.id === highlight)).map(([c, i]) => (
          <Line
            key={c.id}
            dataKey={c.id}
            name={c.label}
            stroke={colorAt(i)}
            strokeDasharray={dashAt(i)}
            strokeWidth={highlight === c.id ? 2.5 : 1.5}
            strokeOpacity={highlight === null || highlight === c.id ? 1 : 0.15}
            dot={false}
            activeDot={{ r: 4 }}
            type="linear"
            isAnimationActive={false}
          />
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

/**
 * A row's actions: a real menu button (Radix DropdownMenu) whose menu is
 * portaled to <body>, so the table's scroll container can't clip it.
 */
function RowMenu({ label, onEquityCurve, buttonRef }: { label: string; onEquityCurve: () => void; buttonRef: (el: HTMLButtonElement | null) => void }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <Button ref={buttonRef} variant="ghost" size="icon" aria-label={`Actions for ${label}`}>
          <EllipsisVertical className="h-4 w-4" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end">
        <DropdownMenu.Item onSelect={onEquityCurve}>
          <LineChartIcon className="h-4 w-4" />
          Equity curve
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}

function returnClass(pct: number): string {
  if (pct > 0) return "text-success";
  if (pct < 0) return "text-danger";
  return "text-ink-primary";
}

/** One figure in the summary strip: a label, the number, a line of context. */
function Stat({ label, value, tone = "", detail }: { label: string; value: string; tone?: string; detail: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 px-4 py-3">
      <dt className="text-12 text-ink-muted">{label}</dt>
      <dd className={`text-20 font-semibold tabular-nums ${tone || "text-ink-primary"}`}>{value}</dd>
      <dd className="truncate text-12 text-ink-muted">{detail}</dd>
    </div>
  );
}

const signedMoney = (n: number) => {
  const r = Math.round(n);
  return `${r >= 0 ? "+" : "−"}${money(Math.abs(r))}`;
};

/**
 * The headline numbers across every deployment: the combined P&L in dollars
 * (each on its own allocation), the best and worst, and how many have enough
 * data for their results to mean anything.
 */
function SummaryStrip({ curves, rows, enough }: { curves: EquitySummary[]; rows: EquityCurveRow[]; enough: (c: EquitySummary) => boolean }) {
  const allocated = new Map(rows.map((r) => [r.deployment_id, r.starting_equity]));
  const capital = curves.reduce((s, c) => s + (allocated.get(c.id) ?? STARTING_CAPITAL), 0);
  const pnl = curves.reduce((s, c) => s + ((allocated.get(c.id) ?? STARTING_CAPITAL) * c.returnPct) / 100, 0);
  const pct = capital > 0 ? (pnl / capital) * 100 : 0;
  const byReturn = [...curves].sort((a, b) => b.returnPct - a.returnPct);
  const best = byReturn[0];
  const worst = byReturn[byReturn.length - 1];
  const ready = curves.filter(enough).length;
  return (
    <Bento size="1" className="!p-0">
      <dl className="grid grid-cols-2 lg:grid-cols-4 [&>div]:border-line-subtle max-lg:[&>div:nth-child(-n+2)]:border-b max-lg:[&>div:nth-child(odd)]:border-r lg:[&>div:not(:first-child)]:border-l">
        <Stat label="Combined P&L" value={signedMoney(pnl)} tone={returnClass(pnl)} detail={`${signedPct(pct)} on ${money(capital)}`} />
        <Stat label="Best" value={signedPct(best.returnPct)} tone={returnClass(best.returnPct)} detail={`${best.label} · ${best.strategy}`} />
        <Stat label="Worst" value={signedPct(worst.returnPct)} tone={returnClass(worst.returnPct)} detail={`${worst.label} · ${worst.strategy}`} />
        <Stat label="Enough data" value={`${ready} of ${curves.length}`} detail={`${SAMPLE.minTrades} trades and ${SAMPLE.minDays} days each`} />
      </dl>
    </Bento>
  );
}

/**
 * The chart's key. Each entry picks out its line: hovering or focusing one
 * dims the rest, and clicking keeps it picked until clicked again.
 */
function Legend({
  curves,
  colors,
  dashes,
  pinned,
  onPin,
  onPreview,
}: {
  curves: EquitySummary[];
  colors: Map<string, string>;
  dashes: Map<string, string | undefined>;
  pinned: string | null;
  onPin: (id: string | null) => void;
  onPreview: (id: string | null) => void;
}) {
  return (
    <ul className="-mx-2 mb-2 flex shrink-0 flex-wrap gap-x-1" aria-label="Deployments in the chart">
      {curves.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            aria-pressed={pinned === c.id}
            onClick={() => onPin(pinned === c.id ? null : c.id)}
            onMouseEnter={() => onPreview(c.id)}
            onMouseLeave={() => onPreview(null)}
            onFocus={() => onPreview(c.id)}
            onBlur={() => onPreview(null)}
            className="flex h-7 items-center gap-2 rounded-full px-2 text-12 text-ink-primary outline-none transition-colors hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-focus aria-pressed:bg-surface-sunken aria-pressed:font-medium"
          >
            <svg aria-hidden width="16" height="2" className="shrink-0">
              <line x1="0" y1="1" x2="16" y2="1" stroke={colors.get(c.id)} strokeWidth="2" strokeDasharray={dashes.get(c.id) ? "4 2" : undefined} />
            </svg>
            {c.label}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** What the page shows, given the curves. Colors follow each curve's position in `curves`. */
export function TradingLeaderboardView({
  curves,
  rows,
  now,
  goLive,
  backtests,
  configs,
}: {
  curves: EquitySummary[];
  rows: EquityCurveRow[];
  now: number;
  goLive: Map<string, GoLive>;
  backtests: Map<string, BacktestReference | null>;
  configs: Map<string, DeploymentConfig>;
}) {
  const colors = new Map(curves.map((c, i) => [c.id, colorAt(i)]));
  const dashes = new Map(curves.map((c, i) => [c.id, dashAt(i)]));
  // Deployments with enough data first, by return; the rest below a divider,
  // so a lucky handful of trades never tops the board.
  const byReturn = [...curves].sort((a, b) => b.returnPct - a.returnPct);
  const enough = (c: EquitySummary) => goLive.get(c.id)?.sample.status !== "insufficient";
  const ranked = [...byReturn.filter(enough), ...byReturn.filter((c) => !enough(c))];
  const firstThin = ranked.findIndex((c) => !enough(c));
  const { height, setHeight, save } = useChartHeight();
  const frame = useRef<HTMLDivElement>(null);
  const [panelId, setPanelId] = useState<string | null>(null);
  const menuButtons = useRef(new Map<string, HTMLButtonElement>());
  const panelRow = panelId ? rows.find((r) => r.deployment_id === panelId) : undefined;
  // The line picked out in the chart: a legend entry or table row being
  // hovered or focused, else the one clicked in the legend.
  const [pinned, setPinned] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const highlight = preview ?? pinned;

  // One set of cell styles for the whole table: a single row height, the same
  // padding everywhere, numbers right-aligned in columns wide enough for their
  // longest value so nothing shifts when a refresh changes a digit.
  const cell = "h-14 px-2 align-middle sm:px-3";
  const num = `${cell} text-right sm:min-w-[4.5rem]`;
  const head = "h-10 px-2 align-middle text-12 font-medium text-ink-muted sm:px-3";
  const numHead = `${head} text-right`;
  // The deployment column stays put while the numbers scroll past it, on the
  // card's own surface so they slide underneath rather than through it; the
  // menu column stays at the right edge the same way.
  const pinnedLeft = "sticky left-0 z-[1] bg-surface-raised";
  const pinnedRight = "sticky right-0 z-[1] bg-surface-raised";
  const COLUMNS = 11;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <SummaryStrip curves={curves} rows={rows} enough={enough} />

      {/* Until the handle is dragged, the chart takes whatever height the
          table leaves, never under 340px; after, the height dragged to. */}
      <Bento
        size="2"
        title="Equity on a $10,000 base"
        tooltip="Each deployment's account, scaled so they all start at $10,000 and can be compared"
        className={`flex flex-col ${height === null ? "flex-1" : ""}`}
      >
        <Legend curves={curves} colors={colors} dashes={dashes} pinned={pinned} onPin={setPinned} onPreview={setPreview} />
        <div ref={frame} className={height === null ? "min-h-[340px] flex-1" : "shrink-0"} style={height === null ? undefined : { height }}>
          <ClientOnly>
            <EquityChart curves={curves} highlight={highlight} />
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
      <Bento size="1" className="!p-0">
        <div className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
          <table className="w-max min-w-full whitespace-nowrap text-13 tabular-nums">
            <thead>
              <tr className="border-b border-line-subtle">
                <th className={`${head} ${pinnedLeft} pl-4 text-left`}>Deployment</th>
                <th className={numHead} aria-sort="descending" title="Ranked by return, among deployments with enough data">
                  <span className="inline-flex items-center gap-1 text-ink-primary">
                    <ArrowDown aria-hidden className="size-3" />
                    Return
                  </span>
                </th>
                <th className={`${head} text-left`} title="Whether the live trades are what the backtest would produce">vs backtest</th>
                <th className={`${head} text-left`} title={`Enough data needs ${SAMPLE.minTrades} closed trades and ${SAMPLE.minDays} trading days`}>Sample</th>
                <th className={`${numHead} border-l border-line-subtle`} title="Largest peak-to-trough fall in its equity">Max DD</th>
                <th className={numHead} title="Gross profit over gross loss">Profit factor</th>
                <th className={numHead} title="Average P&L per trade, as a percent of the equity it was sized from">Per trade</th>
                <th className={numHead}>Trades</th>
                <th className={numHead}>Win rate</th>
                <th className={numHead}>Updated</th>
                <th className={`${head} ${pinnedRight} w-10 px-1`}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((c, index) => {
                const go = goLive.get(c.id);
                const thin = go?.sample.status === "insufficient";
                const tradeOk = go?.sample.tradeStatsMeaningful ?? false;
                // A thin sample's results are shown, but muted: they aren't evidence yet.
                const weak = "text-ink-muted";
                const dimmed = highlight !== null && highlight !== c.id;
                return (
                  <Fragment key={c.id}>
                    {index === firstThin && (
                      <tr className="border-b border-line-subtle">
                        <td colSpan={COLUMNS} className="bg-surface-sunken p-0">
                          <div className="sticky left-0 w-[calc(100vw-4rem)] max-w-2xl whitespace-normal px-4 py-2 text-left text-12 text-ink-muted">
                            <span className="font-medium text-ink-primary">{firstThin === 0 ? "None has enough data yet" : "Not enough data yet"}</span>
                            {" · "}Under {SAMPLE.minTrades} closed trades or {SAMPLE.minDays} trading days, results can&apos;t be told from luck
                            {firstThin === 0 ? ", so the returns below are a record, not a ranking." : ", so these aren't ranked against the rows above."}
                          </div>
                        </td>
                      </tr>
                    )}
                    <tr
                      className={`border-b border-line-subtle text-ink-primary transition-opacity last:border-0 ${dimmed ? "opacity-60" : ""}`}
                      onMouseEnter={() => setPreview(c.id)}
                      onMouseLeave={() => setPreview(null)}
                    >
                      <td className={`${cell} ${pinnedLeft} pl-4 text-left`}>
                        <div className="flex items-center gap-2 font-medium">
                          <span
                            aria-hidden
                            className="size-2 shrink-0 rounded-full"
                            style={dashes.get(c.id) ? { boxShadow: `inset 0 0 0 1.5px ${colors.get(c.id)}` } : { background: colors.get(c.id) }}
                          />
                          {c.label}
                        </div>
                        <div className="pl-4 text-12 text-ink-muted">{c.strategy}</div>
                      </td>
                      <td className={`${num} font-semibold ${thin ? weak : returnClass(c.returnPct)}`}>{signedPct(c.returnPct)}</td>
                      <td className={`${cell} text-left sm:min-w-[6rem]`}>
                        {go?.divergence ? <DivergenceChip divergence={go.divergence} short /> : <Skeleton className="inline-block h-5 w-16 rounded-full align-middle" />}
                      </td>
                      <td className={`${cell} text-left sm:min-w-[6.5rem]`}>
                        {go && <SampleChip sample={go.sample} text={sampleText(go.sample, go.live?.trades ?? c.trades, go.live?.tradingDays ?? 0, true)} />}
                      </td>
                      <td className={`${num} border-l border-line-subtle`}>{c.maxDrawdownPct.toFixed(2)}%</td>
                      <td className={`${num} ${tradeOk ? "" : weak}`}>{fmt(go?.live?.profitFactor)}</td>
                      <td className={`${num} ${tradeOk ? returnClass(go?.live?.expectancyPct ?? 0) : weak}`}>{fmtSignedPct(go?.live?.expectancyPct)}</td>
                      <td className={num}>{c.trades}</td>
                      <td className={`${num} ${tradeOk ? "" : weak}`}>{c.trades > 0 ? `${Math.round((c.wins / c.trades) * 100)}%` : "–"}</td>
                      <td className={`${num} text-ink-muted`}>{formatAge(now - c.latestAt)}</td>
                      <td className={`${cell} ${pinnedRight} w-10 px-1 text-center`}>
                        <RowMenu
                          label={c.label}
                          onEquityCurve={() => setPanelId(c.id)}
                          buttonRef={(el) => {
                            if (el) menuButtons.current.set(c.id, el);
                            else menuButtons.current.delete(c.id);
                          }}
                        />
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Bento>
      {panelRow && (
        <DeploymentPanel
          row={panelRow}
          go={goLive.get(panelRow.deployment_id)}
          backtest={backtests.has(panelRow.deployment_id) ? backtests.get(panelRow.deployment_id) : undefined}
          config={configs.get(panelRow.deployment_id)}
          color={colors.get(panelRow.deployment_id) ?? "var(--ds-color-text-muted)"}
          now={now}
          onClose={() => setPanelId(null)}
          returnFocus={() => menuButtons.current.get(panelRow.deployment_id)?.focus()}
        />
      )}
    </div>
  );
}

/** The page while the curves load: the same frames as the loaded page, with placeholders where the numbers go. */
function LoadingView() {
  return (
    <div className="flex flex-1 flex-col gap-4" aria-busy="true">
      <p className="sr-only" role="status">
        Loading the leaderboard
      </p>
      <Bento size="1" className="!p-0">
        <div className="grid grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-2 px-4 py-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-3 w-28" />
            </div>
          ))}
        </div>
      </Bento>
      <Bento size="2" title="Equity on a $10,000 base" className="flex min-h-[420px] flex-1 flex-col">
        <Skeleton className="min-h-[340px] w-full flex-1" />
      </Bento>
      <Bento size="1" className="!p-0">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex h-14 items-center gap-6 border-b border-line-subtle px-4 last:border-0">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="ml-auto h-4 w-16" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="hidden h-4 w-16 sm:block" />
            <Skeleton className="hidden h-4 w-16 sm:block" />
          </div>
        ))}
      </Bento>
    </div>
  );
}

/** A whole-page message in place of the leaderboard: why there's nothing to show, and what to do. */
function PageMessage({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Bento size="3">
      <div className="flex flex-col items-start gap-2">
        <h2 className="text-16 font-semibold text-ink-primary">{title}</h2>
        <p className="max-w-prose text-13 text-ink-muted">{children}</p>
        {action && <div className="mt-2">{action}</div>}
      </div>
    </Bento>
  );
}

type Pnl = { realized: number; open: number };

/**
 * Realized P&L since each deployment's first report, and its open P&L now,
 * from the snapshots at its first and latest bar. The curves RPC doesn't
 * return P&L, but the snapshot table is public to read.
 */
async function loadPnl(rows: EquityCurveRow[]): Promise<Map<string, Pnl>> {
  const times = [...new Set(rows.flatMap((r) => [r.starting_at, r.latest_at]))];
  const out = new Map<string, Pnl>();
  const data = await loadSnapshotPnl(rows.map((r) => r.deployment_id), times).catch(() => null);
  if (!data) return out;
  const at = (id: string, iso: string) => data.find((s) => s.deployment_id === id && Date.parse(s.bar_time) === Date.parse(iso));
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

export default function TradingLeaderboardContent({ deploymentConfigs = [] }: { deploymentConfigs?: DeploymentConfig[] }) {
  const configs = useMemo(() => new Map(deploymentConfigs.map((c) => [c.id, c])), [deploymentConfigs]);
  const [curves, setCurves] = useState<EquitySummary[] | null>(null);
  const [rows, setRows] = useState<EquityCurveRow[] | null>(null);
  const [pnl, setPnl] = useState<Map<string, Pnl>>(new Map());
  const [backtests, setBacktests] = useState<Map<string, BacktestReference | null>>(new Map());
  // Null until loaded, and if the ledger function isn't there (the migration
  // hasn't run): the table then falls back to the trade count alone.
  const [ledger, setLedger] = useState<Map<string, LedgerRow> | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      let loaded: EquityCurveRow[];
      try {
        loaded = await loadEquityCurves();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
        return;
      }
      if (cancelled) return;
      setError(null);
      setRows(loaded);
      setCurves(loaded.map(summarize));
      setLoadedAt(Date.now());
      if (loaded.length > 0) {
        const [next, trades] = await Promise.all([loadPnl(loaded), loadTradeLedgers().catch(() => null)]);
        if (cancelled) return;
        setPnl(next);
        setLedger(trades);
      }
    }
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [attempt]);

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
    <BentoPageLayout title="Trading Leaderboard" headerActions={<AnalyzeInClaude buildPrompt={buildPrompt} disabled={!rows || rows.length === 0} />}>
      {error && curves === null && (
        <PageMessage
          title="Couldn't load the leaderboard"
          action={
            <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
              <RotateCw className="size-4" />
              Try again
            </Button>
          }
        >
          The equity curves didn&apos;t come back from the database ({error}). It tries again every minute on its own.
        </PageMessage>
      )}
      {!error && curves === null && <LoadingView />}
      {curves?.length === 0 && (
        <PageMessage title="No deployment has reported this week">
          Each deployment reports after every bar it trades. None has in the last 7 days, so either the schedules are off in trading/deployments.ts or the markets have been closed.
        </PageMessage>
      )}
      {curves && curves.length > 0 && <TradingLeaderboardView curves={curves} rows={rows ?? []} now={loadedAt} goLive={goLive} backtests={backtests} configs={configs} />}
    </BentoPageLayout>
  );
}
