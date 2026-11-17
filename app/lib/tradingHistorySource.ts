// Where the Trading Leaderboard reads a deployment's history from: its equity
// over time and the trades it closed. The one place that knows table and RPC
// names, so moving to a different source is a change to this file only.
//
// Today both come from public.trading_equity_snapshots, a row per bar each
// trading Lambda processes (supabase/migrations/20261108_trading_equity.sql):
// equity is marked to that bar's close, open P&L included. Trades are derived
// from it by public.trading_trade_ledger (20261116_trading_trade_ledger.sql)
// as the bars where trades_closed goes up.

import { createClient } from "@/utils/supabase/client";
import type { EquityCurveRow } from "./tradingEquity";

/** One mark-to-market reading of a deployment's account, oldest first. */
export interface SnapshotRow {
  /** ISO time of the bar the reading was taken at (its open). */
  bar_time: string;
  /** Account value at that bar's close: cash plus the open position marked to market. */
  equity: number;
  /** Realized P&L since the deployment's state began, cumulative. */
  realized_pnl: number;
  /** Open P&L on the position held at that bar's close. */
  unrealized_pnl: number;
  /** Signed: positive long, negative short, 0 flat. */
  position_shares: number;
}

/** The P&L columns of a snapshot. */
export interface SnapshotPnl {
  deployment_id: string;
  bar_time: string;
  realized_pnl: number;
  unrealized_pnl: number;
}

/**
 * Closed trades for one deployment, and time in market.
 * trades: [closed at (epoch ms), trades closed on that bar, of them won,
 * realized P&L, equity it was sized from], oldest first.
 */
export type LedgerRow = { deployment_id: string; bars: number; bars_in_position: number; trades: [number, number, number, number, number][] };

function client() {
  const supabase = createClient();
  if (!supabase) throw new Error("Supabase isn't configured here.");
  return supabase;
}

/** Every deployment's equity curve, sampled, for the leaderboard table. */
export async function loadEquityCurves(): Promise<EquityCurveRow[]> {
  const { data, error } = await client().rpc("trading_equity_curves");
  if (error) throw new Error(error.message);
  return (data ?? []) as EquityCurveRow[];
}

/** Every snapshot of one deployment, oldest first, paged past the API's 1,000-row cap. */
export async function loadEquitySnapshots(deploymentId: string): Promise<SnapshotRow[]> {
  const supabase = client();
  const rows: SnapshotRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("trading_equity_snapshots")
      .select("bar_time, equity, realized_pnl, unrealized_pnl, position_shares")
      .eq("deployment_id", deploymentId)
      .order("bar_time")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as SnapshotRow[]));
    if (!data || data.length < 1000) return rows;
  }
}

/** The P&L columns of the given deployments' snapshots at the given bar times. */
export async function loadSnapshotPnl(deploymentIds: string[], barTimes: string[]): Promise<SnapshotPnl[]> {
  const { data, error } = await client()
    .from("trading_equity_snapshots")
    .select("deployment_id, bar_time, realized_pnl, unrealized_pnl")
    .in("deployment_id", deploymentIds)
    .in("bar_time", barTimes);
  if (error) throw new Error(error.message);
  return (data ?? []) as SnapshotPnl[];
}

/** Every live deployment's trades by id, or null when they can't be read. */
export async function loadTradeLedgers(): Promise<Map<string, LedgerRow> | null> {
  const { data, error } = await client().rpc("trading_trade_ledger");
  if (error || !data) return null;
  return new Map((data as LedgerRow[]).map((r) => [r.deployment_id, r]));
}
