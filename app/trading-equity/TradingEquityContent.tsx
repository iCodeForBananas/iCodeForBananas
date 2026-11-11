"use client";

import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ClientOnly from "@/app/lib/ClientOnly";
import { Bento } from "@/app/components/ui/bento";
import { createClient } from "@/utils/supabase/client";
import { STARTING_CAPITAL, formatAge, mergeCurves, niceScale, summarize, type EquityCurveRow, type EquitySummary } from "@/app/lib/tradingEquity";

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

function returnClass(pct: number): string {
  if (pct > 0) return "text-success";
  if (pct < 0) return "text-danger";
  return "text-ink-primary";
}

/** What the page shows, given the curves. Colors follow each curve's position in `curves`. */
export function TradingEquityView({ curves, now }: { curves: EquitySummary[]; now: number }) {
  const colors = new Map(curves.map((c, i) => [c.id, colorAt(i)]));
  const ranked = [...curves].sort((a, b) => b.returnPct - a.returnPct);
  const headCell = "px-3 py-2 font-medium";
  const wide = "hidden sm:table-cell";

  return (
    <div className="flex flex-1 flex-col gap-4">
      {/* The chart takes whatever height the table leaves, never under 340px. */}
      <Bento size="3" className="flex flex-1 flex-col">
        <div className="mb-3 flex shrink-0 flex-wrap gap-x-4 gap-y-1">
          {curves.map((c) => (
            <span key={c.id} className="flex items-center gap-2 text-xs text-ink-primary">
              <span className="h-0.5 w-4 rounded-full" style={{ background: colors.get(c.id) }} />
              {c.label}
            </span>
          ))}
        </div>
        <div className="min-h-[340px] flex-1">
          <ClientOnly>
            <EquityChart curves={curves} />
          </ClientOnly>
        </div>
      </Bento>

      <Bento size="1" className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line-subtle text-right text-xs text-ink-muted">
              <th className={`${headCell} text-left`}>Deployment</th>
              <th className={headCell}>Value</th>
              <th className={headCell}>Return</th>
              <th className={`${headCell} ${wide}`}>Max drawdown</th>
              <th className={headCell}>Position</th>
              <th className={`${headCell} ${wide}`}>Trades</th>
              <th className={`${headCell} ${wide}`}>Updated</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((c) => (
              <tr key={c.id} className="border-b border-line-subtle text-right tabular-nums text-ink-primary last:border-0">
                <td className="px-3 py-3 text-left">
                  <div className="flex items-center gap-2 font-medium">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colors.get(c.id) }} />
                    {c.label}
                  </div>
                  <div className="pl-4 text-xs text-ink-muted">{c.strategy}</div>
                </td>
                <td className="px-3 py-3 font-medium">{money(c.value)}</td>
                <td className={`px-3 py-3 font-medium ${returnClass(c.returnPct)}`}>{signedPct(c.returnPct)}</td>
                <td className={`px-3 py-3 ${wide}`}>{c.maxDrawdownPct.toFixed(2)}%</td>
                <td className="px-3 py-3">{c.position}</td>
                <td className={`px-3 py-3 ${wide}`}>
                  {c.trades}
                  {c.trades > 0 && <span className="text-ink-muted"> ({Math.round((c.wins / c.trades) * 100)}% won)</span>}
                </td>
                <td className={`px-3 py-3 text-ink-muted ${wide}`}>{formatAge(now - c.latestAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Bento>
    </div>
  );
}

export default function TradingEquityContent() {
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
        <h1 className="text-2xl font-bold text-ink-primary">Trading Equity</h1>
      </header>

      {error && curves === null && <Bento size="3" className="text-sm text-ink-muted">Couldn&apos;t load the curves: {error}</Bento>}
      {!error && curves === null && <Bento size="3" className="text-sm text-ink-muted">Loading&hellip;</Bento>}
      {curves?.length === 0 && <Bento size="3" className="text-sm text-ink-muted">No deployment has reported in the last 7 days.</Bento>}
      {curves && curves.length > 0 && <TradingEquityView curves={curves} now={loadedAt} />}
    </main>
  );
}
