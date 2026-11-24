// Rebuilds public.trading_fills rows for fills that happened before the
// runtime wrote them itself, or whose write failed. Re-runnable: the SQL it
// writes inserts with ON CONFLICT DO NOTHING, so a fill already there stays.
//
//   cd trading && npm run backfill-fills [-- --out <dir>]
//
// Two sources, joined on Tradier's order id:
//   - each deployment's log (90 days), the dispatcher's and, for runs before
//     2026-11-24, its own Lambda's retained log group: which deployment the fill was
//     for, and the runtime's own accounting right after it. Lines written
//     since fills were recorded carry them whole ("fills"); older lines are
//     rebuilt from their notes and stateBefore/stateAfter.
//   - Tradier's order history, read by invoking the dispatcher with
//     { "orderHistory": true } so the token never leaves AWS: the exact fill
//     time, the time the order was placed, and a check on price and quantity.
//     The sandbox only returns about the last session's orders, so older
//     fills take their time from the log instead: the end of the run that
//     placed and confirmed the order (within a few seconds of the fill), or,
//     for an order placed after the close and found filled a run later, the
//     next session's 09:30 open, where a market order fills.
//
// Writes fills.sql (apply with the Supabase SQL editor or psql as the table
// owner), fills.json and report.json (what couldn't be backfilled, and why).

import { CloudWatchLogsClient, FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { functionName, type ResolvedDeployment } from '../runtime/config';
import type { Selection } from '../runtime/dispatch';
import type { FillRecord } from '../runtime/equity-report';
import type { HistoricalOrder } from '../runtime/order-history';
import type { DeploymentState, Position } from '../runtime/run';
import { etParts, etWallToUtcMs, SESSION_CLOSE_MIN, SESSION_OPEN_MIN } from '../runtime/time';

const outArg = process.argv.indexOf('--out');
const outDir = outArg > 0 ? process.argv[outArg + 1] : join(tmpdir(), 'trading-fills-backfill');
const lambda = new LambdaClient({});
const DISPATCHER = 'tradier-dispatcher';

async function invokeDispatcher<T>(event: Record<string, unknown>): Promise<T> {
  const res = await lambda.send(new InvokeCommand({ FunctionName: DISPATCHER, Payload: Buffer.from(JSON.stringify(event)) }));
  const payload = res.Payload ? Buffer.from(res.Payload).toString() : '';
  if (res.FunctionError) throw new Error(`${JSON.stringify(event)} failed: ${payload.slice(0, 500)}`);
  return JSON.parse(payload) as T;
}
const logs = new CloudWatchLogsClient({});

interface LogLine {
  deployment: string;
  dryRun?: boolean;
  invokedAt: string;
  durationMs?: number;
  notes?: string[];
  ordersPlaced?: { orderId?: string; reason?: string; side?: string }[];
  stateBefore?: Partial<DeploymentState> | null;
  stateAfter?: DeploymentState;
  fills?: FillRecord[];
}

const FILL_NOTE = /^(?:entry (long|short) ([\d.]+) @ ([\d.]+)|exit ([\d.]+) @ ([\d.]+)) filled \(order (\d+)\)(?:, realized (-?[\d.]+))?/;
/** The first weekday 09:30 ET open at or after `ms` (holidays aside). */
function nextSessionOpen(ms: number): number {
  for (let back = 0; back < 8; back++) {
    const p = etParts(ms + back * 86_400_000);
    const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
    const open = etWallToUtcMs(p.year, p.month, p.day, Math.floor(SESSION_OPEN_MIN / 60), SESSION_OPEN_MIN % 60);
    if (weekday !== 0 && weekday !== 6 && open >= ms) return open;
  }
  throw new Error('no weekday in the next week');
}

/** When a fill rebuilt from a log line happened, as near as the log can tell. */
function logFillTime(line: LogLine, pending: { placedAt?: number } | null): number {
  const runEnd = Date.parse(line.invokedAt) + (line.durationMs ?? 0);
  if (!pending?.placedAt) return runEnd;
  const p = etParts(pending.placedAt);
  const minute = p.hour * 60 + p.minute;
  // Placed outside the session: Tradier filled it at the next open.
  return minute >= SESSION_CLOSE_MIN || minute < SESSION_OPEN_MIN ? nextSessionOpen(pending.placedAt) : runEnd;
}

const signed = (p: Position | null | undefined) => (p ? (p.side === 'long' ? 1 : -1) * p.shares : 0);

async function readLines(d: ResolvedDeployment): Promise<LogLine[]> {
  const out: LogLine[] = [];
  for (const group of [`/aws/lambda/${functionName(d)}`, `/aws/lambda/${DISPATCHER}`]) {
    let nextToken: string | undefined;
    do {
      const r = await logs.send(new FilterLogEventsCommand({ logGroupName: group, filterPattern: '"filled (order"', nextToken })).catch((err: Error) => {
        // A deployment that never had its own Lambda has no group of its own.
        if (err.name === 'ResourceNotFoundException') return null;
        throw err;
      });
      for (const e of r?.events ?? []) {
        const m = e.message ?? '';
        const line = JSON.parse(m.slice(m.indexOf('{'))) as LogLine;
        if (line.deployment === d.id && !line.dryRun) out.push(line);
      }
      nextToken = r?.nextToken;
    } while (nextToken);
  }
  return out.sort((a, b) => a.invokedAt.localeCompare(b.invokedAt));
}

/** A pre-recording log line's one fill, on the deployment's starting-equity basis. */
function rebuild(d: ResolvedDeployment, line: LogLine, problems: string[]): FillRecord | null {
  const notes = line.notes ?? [];
  const matches = notes.map((n) => n.match(FILL_NOTE)).filter((m): m is RegExpMatchArray => m !== null);
  if (matches.length !== 1) {
    problems.push(`${d.id} ${line.invokedAt}: ${matches.length} fills in one pre-recording line; skipped`);
    return null;
  }
  const m = matches[0];
  const before = line.stateBefore ?? {};
  const after = line.stateAfter;
  if (!after?.allocationBase) {
    problems.push(`${d.id} ${line.invokedAt}: no stateAfter; skipped`);
    return null;
  }
  const orderId = m[6];
  // Before the rebase onto startingEquity the state was on a share of the
  // account. The runtime scaled its P&L by startingEquity / old base, and the
  // public snapshots carry the same scale, so these rows do too.
  const scale = d.startingEquity / after.allocationBase;
  const rebasedThisRun = notes.some((n) => n.startsWith('starting equity rebased'));
  const k = rebasedThisRun && before.allocationBase ? d.startingEquity / before.allocationBase : 1;
  const pending = before.pendingOrder?.id === orderId ? before.pendingOrder : null;
  const placed = line.ordersPlaced?.find((o) => o.orderId === orderId);
  const common = {
    deploymentId: d.id,
    orderId,
    strategyId: d.strategyId,
    symbol: d.symbol,
    interval: d.interval,
    fillTime: logFillTime(line, pending),
    placedAt: pending?.placedAt ?? null,
    reason: pending?.reason ?? placed?.reason ?? null,
    positionSharesAfter: signed(after.position),
    realizedPnlTotal: after.realizedPnlTotal * scale,
    tradesClosed: after.tradesClosed,
    winningTrades: after.winningTrades,
    pnlScale: scale,
    source: 'backfill' as const,
  };
  if (m[1]) {
    const side = m[1] as 'long' | 'short';
    return {
      ...common,
      action: 'open',
      positionSide: side,
      orderSide: side === 'long' ? 'buy' : 'sell_short',
      shares: Number(m[2]),
      fillPrice: Number(m[3]),
      entryPrice: null,
      realizedPnl: null,
      tradePnl: null,
      equityAfter: d.startingEquity + common.realizedPnlTotal,
    };
  }
  const pos = before.position;
  const side = pos?.side ?? pending?.side ?? (placed?.side === 'buy_to_cover' ? 'short' : placed?.side === 'sell' ? 'long' : null);
  if (!pos || !side) {
    problems.push(`${d.id} order ${orderId}: exit with no position on record before it; skipped`);
    return null;
  }
  const shares = Number(m[4]);
  const price = Number(m[5]);
  const dir = side === 'long' ? 1 : -1;
  const pnl = (price - pos.entryPrice) * shares * dir;
  const remaining = pos.shares - shares;
  return {
    ...common,
    action: 'close',
    positionSide: side,
    orderSide: side === 'long' ? 'sell' : 'buy_to_cover',
    shares,
    fillPrice: price,
    entryPrice: pos.entryPrice,
    realizedPnl: pnl * scale,
    tradePnl: remaining > 0 ? null : ((pos.realizedPnl ?? 0) * k + pnl) * scale,
    equityAfter: d.startingEquity + common.realizedPnlTotal + (price - pos.entryPrice) * remaining * dir * scale,
  };
}

const sqlValue = (v: unknown) =>
  v === null || v === undefined ? 'null' : typeof v === 'number' ? (Number.isFinite(v) ? String(v) : 'null') : `'${String(v).replace(/'/g, "''")}'`;
const isoOrNull = (ms: number | null) => (ms == null ? null : new Date(ms).toISOString());

function toSql(fills: FillRecord[]): string {
  const cols = 'deployment_id, order_id, strategy_id, symbol, bar_interval, action, position_side, order_side, shares, fill_price, fill_time, placed_at, reason, entry_price, realized_pnl, trade_pnl, position_shares_after, realized_pnl_total, equity_after, trades_closed, winning_trades, pnl_scale, source';
  const rows = fills.map((f) =>
    `  (${[f.deploymentId, f.orderId, f.strategyId, f.symbol, f.interval, f.action, f.positionSide, f.orderSide, f.shares, f.fillPrice, isoOrNull(f.fillTime), isoOrNull(f.placedAt), f.reason, f.entryPrice, f.realizedPnl, f.tradePnl, f.positionSharesAfter, f.realizedPnlTotal, f.equityAfter, f.tradesClosed, f.winningTrades, f.pnlScale, f.source].map(sqlValue).join(', ')})`,
  );
  return `-- Generated by trading/scripts/backfill-fills.ts on ${new Date().toISOString()}.\ninsert into public.trading_fills (${cols}) values\n${rows.join(',\n')}\non conflict (deployment_id, order_id) do nothing;\n`;
}

// The enabled deployments, as the dispatcher runs them.
const deployments = (await invokeDispatcher<Selection>({ listDeployments: true })).run;

// Tradier's side, through the dispatcher, so the token never leaves AWS.
const history = await invokeDispatcher<{ orders: HistoricalOrder[]; pages: number; complete: boolean }>({ orderHistory: true });
const orders = new Map(history.orders.map((o) => [o.id, o]));

const fills: FillRecord[] = [];
const problems: string[] = [];
// exactTimes: fill time from Tradier's order record; the rest are from the log (see the header).
const perDeployment: Record<string, { fills: number; first: string | null; last: string | null; exactTimes: number; timesFromLog: number }> = {};
for (const d of deployments) {
  const lines = await readLines(d);
  const mine: FillRecord[] = [];
  for (const line of lines) {
    if (line.fills?.length) mine.push(...line.fills.map((f) => ({ ...f, source: 'backfill' as const })));
    else {
      const f = rebuild(d, line, problems);
      if (f) mine.push(f);
    }
  }
  let exactTimes = 0;
  let timesFromLog = 0;
  for (const f of mine) {
    const o = orders.get(f.orderId);
    if (!o) {
      timesFromLog++;
      continue;
    }
    const t = o.transactionDate ? Date.parse(o.transactionDate) : NaN;
    if (Number.isFinite(t)) {
      f.fillTime = t;
      exactTimes++;
    }
    const placed = o.createDate ? Date.parse(o.createDate) : NaN;
    if (f.placedAt == null && Number.isFinite(placed)) f.placedAt = placed;
    if (o.avgFillPrice != null && Math.abs(o.avgFillPrice - f.fillPrice) > 1e-6) problems.push(`${d.id} order ${f.orderId}: log price ${f.fillPrice}, Tradier ${o.avgFillPrice}; kept the log's (what the runtime booked)`);
    if (o.execQuantity != null && o.execQuantity !== f.shares && f.action === 'open') problems.push(`${d.id} order ${f.orderId}: log ${f.shares} shares, Tradier ${o.execQuantity}`);
  }
  fills.push(...mine);
  perDeployment[d.id] = { fills: mine.length, first: mine.length ? new Date(mine[0].fillTime).toISOString() : null, last: mine.length ? new Date(mine[mine.length - 1].fillTime).toISOString() : null, exactTimes, timesFromLog };
}

// Filled orders Tradier has that no deployment's log accounts for.
const known = new Set(fills.map((f) => f.orderId));
const unaccounted = history.orders
  .filter((o) => (o.execQuantity ?? 0) > 0 && !known.has(o.id))
  .map((o) => ({ id: o.id, tag: o.tag, symbol: o.symbol, side: o.side, qty: o.execQuantity, price: o.avgFillPrice, at: o.transactionDate }));
const historySpan = history.orders.map((o) => o.createDate ?? o.transactionDate).filter((x): x is string => !!x).sort();

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'fills.json'), JSON.stringify(fills, null, 2));
writeFileSync(join(outDir, 'fills.sql'), toSql(fills));
const report = {
  tradierHistory: { orders: history.orders.length, pages: history.pages, complete: history.complete, oldest: historySpan[0] ?? null, newest: historySpan[historySpan.length - 1] ?? null },
  perDeployment,
  problems,
  unaccountedTradierFills: unaccounted,
};
writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ outDir, fills: fills.length, ...report, unaccountedTradierFills: unaccounted.length }, null, 2));
