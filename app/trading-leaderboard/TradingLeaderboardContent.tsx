"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronDown } from "lucide-react";
import ClientOnly from "@/app/lib/ClientOnly";
import { Bento } from "@/app/components/ui/bento";
import { createClient } from "@/utils/supabase/client";
import { STARTING_CAPITAL, formatAge, mergeCurves, niceScale, summarize, type EquityCurveRow, type EquitySummary } from "@/app/lib/tradingEquity";
import { deploymentDetails } from "@/app/lib/deploymentDetails";

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
const signedPct = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(2)}%`;

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

function returnClass(pct: number): string {
  if (pct > 0) return "text-success";
  if (pct < 0) return "text-danger";
  return "text-ink-primary";
}

/** What the page shows, given the curves. Colors follow each curve's position in `curves`. */
export function TradingLeaderboardView({ curves, now }: { curves: EquitySummary[]; now: number }) {
  const colors = new Map(curves.map((c, i) => [c.id, colorAt(i)]));
  const ranked = [...curves].sort((a, b) => b.returnPct - a.returnPct);
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
              <th className={headCell}>Value</th>
              <th className={headCell}>Return</th>
              <th className={headCell}>Max drawdown</th>
              <th className={headCell}>Position</th>
              <th className={headCell}>Trades</th>
              <th className={headCell}>Updated</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((c) => {
              const d = details.get(c.id)!;
              const isOpen = open.has(c.id);
              return (
              <Fragment key={c.id}>
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
                <td className="px-3 py-3 font-medium">{money(c.value)}</td>
                <td className={`px-3 py-3 font-medium ${returnClass(c.returnPct)}`}>{signedPct(c.returnPct)}</td>
                <td className="px-3 py-3">{c.maxDrawdownPct.toFixed(2)}%</td>
                <td className="px-3 py-3">{c.position}</td>
                <td className="px-3 py-3">
                  {c.trades}
                  {c.trades > 0 && <span className="text-ink-muted"> ({Math.round((c.wins / c.trades) * 100)}% won)</span>}
                </td>
                <td className="px-3 py-3 text-ink-muted">{formatAge(now - c.latestAt)}</td>
              </tr>
              {isOpen && (
                <tr id={`details-${c.id}`} className="border-b border-line-subtle last:border-0">
                  <td colSpan={7} className="p-0">
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

export default function TradingLeaderboardContent() {
  const [curves, setCurves] = useState<EquitySummary[] | null>(null);
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
      setCurves(((data ?? []) as EquityCurveRow[]).map(summarize));
      setLoadedAt(Date.now());
    }
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <main className="flex w-full flex-1 flex-col px-4 py-4">
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-ink-primary">Trading Leaderboard</h1>
      </header>

      {error && curves === null && <Bento size="3" className="text-sm text-ink-muted">Couldn&apos;t load the curves: {error}</Bento>}
      {!error && curves === null && <Bento size="3" className="text-sm text-ink-muted">Loading&hellip;</Bento>}
      {curves?.length === 0 && <Bento size="3" className="text-sm text-ink-muted">No deployment has reported in the last 7 days.</Bento>}
      {curves && curves.length > 0 && <TradingLeaderboardView curves={curves} now={loadedAt} />}
    </main>
  );
}
