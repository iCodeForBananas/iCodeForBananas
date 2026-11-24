"use client";

// The Trading Leaderboard's deployment panel, opened from a row's Equity curve button: one
// deployment's mark-to-market equity curve (drawdowns shaded, the backtest
// overlaid), what it holds, how it's configured, and every statistic that
// doesn't fit the table. A Radix Themes Dialog styled as a side sheet, so
// focus is trapped while it's open, Escape closes it, and focus goes back to
// the button that opened it. Full-screen at phone width.

import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@radix-ui/themes";
import { X } from "lucide-react";
import { CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ClientOnly from "@/app/lib/ClientOnly";
import { Bento } from "@/app/components/ui/bento";
import { Button } from "@/app/components/ui/button";
import { loadEquitySnapshots } from "@/app/lib/tradingHistorySource";
import { formatAge, niceScale, type EquityCurveRow } from "@/app/lib/tradingEquity";
import { deploymentStats } from "@/app/lib/tradingStats";
import { deploymentDetails, type DeploymentConfig } from "@/app/lib/deploymentDetails";
import { backtestOverlay, equityHistory, type EquityHistory } from "@/app/lib/equityHistory";
import type { BacktestReference } from "@/app/lib/backtestReference";
import { DivergenceChip, GoLiveStats, SampleChip, fmt, fmtMoney, fmtSignedPct, type GoLive } from "./goLive";

const ET: Intl.DateTimeFormatOptions = { timeZone: "America/New_York" };
const dayFormat = new Intl.DateTimeFormat("en-US", { ...ET, month: "short", day: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-US", { ...ET, hour: "numeric" });
const fullFormat = new Intl.DateTimeFormat("en-US", { ...ET, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const DAY_MS = 86_400_000;
const axisTime = (t: number, spanMs: number) =>
  spanMs <= DAY_MS ? timeFormat.format(t) : spanMs <= 7 * DAY_MS ? `${dayFormat.format(t)}, ${timeFormat.format(t)}` : dayFormat.format(t);
const at = (t: number | null | undefined) => (t ? `${fullFormat.format(t)} ET` : "–");

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; history: EquityHistory | null };

interface ChartRow {
  t: number;
  live?: number;
  backtest?: number;
}

function CurveTooltip({ active, label, payload }: { active?: boolean; label?: unknown; payload?: readonly { dataKey?: unknown; value?: unknown }[] }) {
  if (!active || !payload?.length || typeof label !== "number") return null;
  const value = (key: string) => payload.find((p) => p.dataKey === key)?.value as number | undefined;
  const live = value("live");
  const bt = value("backtest");
  return (
    <div className="rounded-lg border border-line-strong bg-surface-overlay px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 text-ink-muted">{fullFormat.format(label)} ET</div>
      {live !== undefined && <div className="tabular-nums text-ink-primary">Live {fmtMoney(live)}</div>}
      {bt !== undefined && <div className="tabular-nums text-ink-muted">Backtest {fmtMoney(bt)}</div>}
    </div>
  );
}

function EquityCurve({ history, overlay, color }: { history: EquityHistory; overlay: [number, number][] | null; color: string }) {
  const data = useMemo(() => {
    const byTime = new Map<number, ChartRow>();
    for (const [t, v] of history.points) byTime.set(t, { t, live: v });
    for (const [t, v] of overlay ?? []) byTime.set(t, { ...(byTime.get(t) ?? { t }), backtest: v });
    return [...byTime.values()].sort((a, b) => a.t - b.t);
  }, [history, overlay]);
  const scale = useMemo(() => niceScale([...history.points.map(([, v]) => v), ...(overlay ?? []).map(([, v]) => v)]), [history, overlay]);
  const span = history.last.time - history.first.time;
  const dd = history.maxDrawdown;

  if (history.points.length < 2) return <p className="flex h-full items-center justify-center text-sm text-ink-muted">The curve starts once a second bar has been reported.</p>;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--ds-color-border-subtle)" />
        {history.drawdowns.map((d) => (
          <ReferenceArea key={d.start} x1={d.start} x2={d.end ?? history.last.time} fill="var(--ds-color-danger)" fillOpacity={0.12} stroke="none" />
        ))}
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
        <YAxis domain={scale.domain} ticks={scale.ticks} tickFormatter={(v: number) => fmtMoney(v)} width={62} tick={{ fill: "var(--ds-color-text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
        <ReferenceLine y={history.first.value} stroke="var(--ds-color-text-muted)" strokeDasharray="4 4" />
        {overlay && <Line dataKey="backtest" stroke="var(--ds-color-text-muted)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} connectNulls isAnimationActive={false} />}
        <Line dataKey="live" stroke={color} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
        <ReferenceDot x={history.peak.time} y={history.peak.value} r={4} fill="var(--ds-color-success)" stroke="var(--ds-color-surface-raised)" />
        {dd && <ReferenceDot x={dd.troughTime} y={dd.troughValue} r={4} fill="var(--ds-color-danger)" stroke="var(--ds-color-surface-raised)" />}
        <Tooltip cursor={{ stroke: "var(--ds-color-border-strong)" }} isAnimationActive={false} content={(p) => <CurveTooltip active={p.active} label={p.label} payload={p.payload as never} />} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function Facts({ items }: { items: [label: string, value: React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      {items.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-ink-muted">{label}</dt>
          <dd className="text-right font-medium tabular-nums text-ink-primary sm:text-left">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface DeploymentPanelProps {
  row: EquityCurveRow;
  go: GoLive | undefined;
  /** undefined while loading, null when there's none. */
  backtest: BacktestReference | null | undefined;
  /** From public.strategy_deployments; undefined when the id isn't there (removed since). */
  config: DeploymentConfig | undefined;
  color: string;
  now: number;
  onClose: () => void;
  /** Where focus goes when the panel closes: the button that opened it. */
  returnFocus: () => void;
}

export function DeploymentPanel({ row, go, backtest, config, color, now, onClose, returnFocus }: DeploymentPanelProps) {
  const s = useMemo(() => deploymentStats(row, now), [row, now]);
  const details = useMemo(() => deploymentDetails({ id: row.deployment_id, strategyId: row.strategy_id, symbol: row.symbol, interval: row.bar_interval }), [row]);
  const label = `${row.symbol} ${row.bar_interval.replace("min", "m")}`;
  const [load, setLoad] = useState<Load>({ status: "loading" });

  // The curve loads when the panel opens, never with the table.
  useEffect(() => {
    let cancelled = false;
    loadEquitySnapshots(row.deployment_id)
      .then((rows) => !cancelled && setLoad({ status: "ready", history: equityHistory(rows) }))
      .catch((e: unknown) => !cancelled && setLoad({ status: "error", message: e instanceof Error ? e.message : String(e) }));
    return () => {
      cancelled = true;
    };
  }, [row.deployment_id]);

  const history = load.status === "ready" ? load.history : null;
  const overlay = useMemo(() => (history && backtest ? backtestOverlay(backtest.curve, history.first) : null), [history, backtest]);
  const overlayEnd = overlay ? overlay[overlay.length - 1] : null;
  const liveAtOverlayEnd = overlayEnd && history ? [...history.points].reverse().find(([t]) => t <= overlayEnd[0])?.[1] : undefined;

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Content
        // A side sheet rather than a centered modal; the whole screen on a phone.
        className="!fixed !inset-y-0 !right-0 !left-auto !m-0 !h-dvh !max-h-dvh !w-screen !max-w-none !overflow-y-auto !rounded-none !p-0 sm:!w-[max(45vw,28rem)] sm:!border-l sm:!border-line-strong"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          returnFocus();
        }}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line-subtle bg-surface-overlay px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <Dialog.Title size="5" mb="1" className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
              {label}
              <span className="truncate text-base font-normal text-ink-muted">{s.strategy.name}</span>
            </Dialog.Title>
            <Dialog.Description size="2" className="flex flex-wrap items-center gap-2 text-ink-muted">
              {go && <SampleChip sample={go.sample} />}
              {go && <DivergenceChip divergence={go.divergence} />}
              <span>Return {fmtSignedPct(s.returnPct)}</span>
            </Dialog.Description>
          </div>
          <Dialog.Close>
            <Button variant="ghost" size="icon" aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </Dialog.Close>
        </header>

        <div className="flex flex-col gap-4 p-4 sm:p-6">
          <Bento size="2" title="Equity curve" tooltip="Equity marked to market at every bar, from the deployment's first report">
            <div className="h-72" role="img" aria-label={history ? `Equity from ${fmtMoney(history.first.value)} to ${fmtMoney(history.last.value)}, peak ${fmtMoney(history.peak.value)}, max drawdown ${fmt(history.maxDrawdown?.pct, 2, "%")}` : "Equity curve loading"}>
              {load.status === "loading" && <p className="flex h-full items-center justify-center text-sm text-ink-muted">Loading the equity history&hellip;</p>}
              {load.status === "error" && <p className="flex h-full items-center justify-center text-sm text-ink-muted">Couldn&apos;t load the equity history: {load.message}</p>}
              {load.status === "ready" && !history && <p className="flex h-full items-center justify-center text-sm text-ink-muted">No reports yet.</p>}
              {history && (
                <ClientOnly>
                  <EquityCurve history={history} overlay={overlay} color={color} />
                </ClientOnly>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
              <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full" style={{ background: color }} />Live</span>
              <span className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-ink-muted" />Backtest, same bars</span>
              <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-danger/20" />In drawdown</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success" />Peak</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-danger" />Deepest point</span>
            </div>
            {history && (
              <div className="mt-4">
                <Facts
                  items={[
                    ["Started", `${fmtMoney(history.first.value)} · ${at(history.first.time)}`],
                    ["Now", `${fmtMoney(history.last.value)} · ${fmtSignedPct((history.last.value / history.first.value - 1) * 100)}`],
                    ["Peak", `${fmtMoney(history.peak.value)} · ${at(history.peak.time)}`],
                    [
                      "Max drawdown",
                      history.maxDrawdown
                        ? `${fmt(history.maxDrawdown.pct, 2, "%")} · ${fmtMoney(history.maxDrawdown.dollars)} · ${history.maxDrawdown.recoveredAt ? `recovered ${at(history.maxDrawdown.recoveredAt)}` : "not recovered"}`
                        : "None",
                    ],
                    ["Drawdown now", history.current.pct > 0 ? `${fmt(history.current.pct, 2, "%")} · ${fmtMoney(history.current.dollars)} · since ${at(history.current.since)}` : "At its peak"],
                    ["Time in drawdown", fmt(go?.live?.timeInDrawdownPct, 0, "%")],
                    [
                      "Backtest, same bars",
                      overlay && overlayEnd && liveAtOverlayEnd !== undefined
                        ? `${fmtSignedPct((overlayEnd[1] / history.first.value - 1) * 100)} vs live ${fmtSignedPct((liveAtOverlayEnd / history.first.value - 1) * 100)} to ${at(overlayEnd[0])}${backtest?.sameWindow?.backtestInTradeAtStart ? " (backtest already in a trade at the start)" : ""}`
                        : backtest === undefined
                          ? "Backtest still loading"
                          : backtest === null
                            ? "No backtest for this deployment"
                            : `The backtest's data ends ${backtest.to}, before the live record began`,
                    ],
                  ]}
                />
              </div>
            )}
          </Bento>

          <Bento size="2" title="Position and orders">
            <Facts
              items={[
                ["Position", history ? `${history.position.side}${history.position.shares ? ` · ${Math.abs(history.position.shares)} shares` : ""}` : s.position],
                ["Held since", history?.position.shares ? (history.position.since ? at(history.position.since) : "Before the record began") : "–"],
                ["Open P&L", history ? fmtMoney(history.position.openPnl) : "–"],
                ["Realized P&L", history ? `${fmtMoney(history.realizedSinceStart)} since the record began · ${fmtMoney(history.realizedTotal)} in total` : "–"],
                ["Value", fmtMoney(s.equity)],
              ]}
            />
            <p className="mt-3 text-xs text-ink-muted">
              Open orders aren&apos;t shown: the Lambda keeps its pending order in its own DynamoDB state, which isn&apos;t published anywhere this page can read.
            </p>
          </Bento>

          <Bento size="2" title="Deployment">
            {details.description && <p className="mb-3 text-sm text-ink-primary">{details.description}</p>}
            <Facts
              items={[
                ["Strategy", s.strategy.name],
                ["Symbol · bars", `${row.symbol} · ${row.bar_interval.replace("min", "m")}`],
                ["Sides", details.sides ?? "–"],
                ...details.params.map((p) => [p.name, p.value] as [string, string]),
                ["Live since", at(Date.parse(s.liveSince))],
                ["Last report", `${at(Date.parse(s.lastReport))} · ${formatAge(now - Date.parse(s.lastReport))}`],
                [
                  "Schedule",
                  config === undefined
                    ? "No longer deployed"
                    : config.enabled
                      ? "Running, every bar close"
                      : "Paused",
                ],
                ...(config
                  ? ([
                      ["Sizing", `${fmtMoney(config.startingEquity)} of its own, ${config.positionSizePct}% per position`],
                      ["Limits", `${config.drawdownLimitPct}% drawdown pauses ${config.drawdownPauseBars} bars · ${config.maxDailyLossPct}% daily loss stops entries`],
                    ] as [string, string][])
                  : []),
                ["Deployment id", <code key="id" className="break-all text-xs">{row.deployment_id}</code>],
              ]}
            />
          </Bento>

          <Bento size="2" title="Statistics, live and backtest">
            {go ? (
              <div className="text-xs text-ink-muted">
                <GoLiveStats go={go} backtest={backtest} value={s.equity} position={s.position} />
              </div>
            ) : (
              <p className="text-sm text-ink-muted">Loading&hellip;</p>
            )}
          </Bento>

          <Bento size="2" title="Daily returns">
            <Facts
              items={[
                ["Trading days", String(s.daily.days)],
                ["Mean · standard deviation", `${fmtSignedPct(s.daily.meanDailyReturnPct, 3)} · ${fmt(s.daily.stdevDailyReturnPct, 3, "%")}`],
                ["Best · worst day", `${fmtSignedPct(s.daily.bestDayPct)} · ${fmtSignedPct(s.daily.worstDayPct)}`],
                ["Up days", fmt(s.daily.upDaysPct, 0, "%")],
              ]}
            />
          </Bento>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
