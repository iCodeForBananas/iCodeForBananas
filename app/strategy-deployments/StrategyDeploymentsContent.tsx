"use client";

// The strategies deployed from the backtester: what each trades, whether it's
// on, and what the dispatcher did with it last. Pausing stops new runs on the
// next tick and leaves any position open. Removing closes the position: the
// dispatcher cancels its order, closes at market (at the next open if the
// market is shut), then deletes the row.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Callout, Table, Text } from "@radix-ui/themes";
import { Pause, Play, RotateCw, Trash2 } from "lucide-react";
import BentoPageLayout from "@/app/components/BentoPageLayout";
import { Bento } from "@/app/components/ui/bento";
import { Button } from "@/app/components/ui/button";
import { AVAILABLE_STRATEGIES } from "@/app/strategies";

interface Row {
  id: string;
  strategy_id: string;
  symbol: string;
  bar_interval: string;
  params: Record<string, string | number | boolean>;
  enable_shorts: boolean;
  starting_equity: number;
  position_size_pct: number;
  enabled: boolean;
  last_run_at: string | null;
  last_action: string | null;
  last_reason: string | null;
  last_error: string | null;
  teardown_requested_at: string | null;
  created_at: string;
}

const when = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function StrategyDeploymentsContent() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/strategy-deployments", { cache: "no-store" }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) {
      setError(json.error ?? "Couldn't load deployments.");
      setRows((r) => r ?? []);
      return;
    }
    setRows(json.deployments);
  }, []);

  useEffect(() => {
    // Fetch on mount; the setState calls happen after the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function act(id: string, init: RequestInit, url = "/api/strategy-deployments") {
    setBusy(id);
    setError(null);
    const res = await fetch(url, init).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) setError([json.error ?? "That didn't work.", ...(json.details ?? [])].join(" "));
    await load();
    setBusy(null);
  }

  const setEnabled = (id: string, enabled: boolean) =>
    act(id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, enabled }) });
  const remove = (r: Row) => {
    if (!confirm(`Remove ${r.id}? Its position is closed at market (at the next open if the market is shut), then it's deleted.`)) return;
    void act(r.id, { method: "DELETE" }, `/api/strategy-deployments?id=${encodeURIComponent(r.id)}`);
  };

  return (
    <BentoPageLayout
      title="Deployed Strategies"
      breadcrumbs={[{ label: "Algo Back Tester", href: "/algo-backtest" }]}
      headerActions={
        <Button variant="secondary" onClick={() => void load()}>
          <RotateCw className="size-4" />
          Refresh
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Text as="p" size="2" className="text-ink-muted">
          Strategies deployed from the backtester. One Lambda checks them every 5 minutes on weekdays and paper-trades each on Tradier when its bar closes (15 minutes later, for the sandbox&apos;s data delay). Results land on the{" "}
          <Link href="/trading-leaderboard" className="underline">
            Trading Leaderboard
          </Link>
          .
        </Text>
        {error && (
          <Callout.Root color="red" size="1" role="alert">
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}
        <Bento size="2" title="Deployments">
          {rows === null ? (
            <Text size="2" className="text-ink-muted">
              Loading…
            </Text>
          ) : rows.length === 0 ? (
            <Text size="2" className="text-ink-muted">
              Nothing deployed yet. Run a backtest, pick a result and press Deploy strategy.
            </Text>
          ) : (
            <Table.Root size="1" variant="ghost">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell>Strategy</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Last run</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell />
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {rows.map((r) => (
                  <Table.Row key={r.id}>
                    <Table.Cell>
                      <Text as="div" size="2" weight="medium">
                        {AVAILABLE_STRATEGIES[r.strategy_id]?.name ?? r.strategy_id} · {r.symbol} · {r.bar_interval}
                      </Text>
                      <Text as="div" size="1" className="font-mono text-ink-muted">
                        {r.id}
                      </Text>
                      <Text as="div" size="1" className="text-ink-muted">
                        {r.enable_shorts ? "Long and short" : "Long only"} · {r.position_size_pct}% of ${r.starting_equity.toLocaleString("en-US")}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Badge color={r.teardown_requested_at ? "orange" : r.enabled ? "green" : "gray"}>{r.teardown_requested_at ? "Closing" : r.enabled ? "Running" : "Paused"}</Badge>
                    </Table.Cell>
                    <Table.Cell>
                      {r.last_run_at ? (
                        <>
                          <Text as="div" size="2">
                            {when.format(new Date(r.last_run_at))} ET · {r.last_action}
                          </Text>
                          {(r.last_error || r.last_reason) && (
                            <Text as="div" size="1" color={r.last_error ? "red" : undefined} className={r.last_error ? undefined : "text-ink-muted"}>
                              {r.last_error ?? r.last_reason}
                            </Text>
                          )}
                        </>
                      ) : (
                        <Text size="2" className="text-ink-muted">
                          Not yet
                        </Text>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="secondary" disabled={busy === r.id} onClick={() => void setEnabled(r.id, !r.enabled)}>
                          {r.enabled ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                          {r.enabled ? "Pause" : "Resume"}
                        </Button>
                        <Button size="sm" variant="danger" disabled={busy === r.id || !!r.teardown_requested_at} onClick={() => remove(r)} aria-label={`Remove ${r.id}`}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          )}
        </Bento>
      </div>
    </BentoPageLayout>
  );
}
