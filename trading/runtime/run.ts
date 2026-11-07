// One invocation of one deployment: handle the newest completed bar.
//
//   reconcile against Tradier (Tradier wins) -> indicators from the backtest
//   engine -> the strategy's own handler -> exit, else entry (flat, no exit on
//   the same bar) -> drawdown limit, last -> market orders in regular hours
//   only -> one conditional state write -> one JSON log line with EMF metrics.
//
// Dependencies are injected so the whole flow runs in tests against fakes.
// Never trades on missing, stale or incomplete data: when in doubt it does
// nothing and logs why.

import type { StrategyDefinition } from '@/app/strategies/types';
import { DATA_DELAY_MS, INTERVALS, SOURCE_INTERVAL, isDaily, type Interval, type ResolvedDeployment } from './config';
import { aggregateBars, computeSeries, parseBars, parseDailyBars, sessionClose, type ParsedBars } from './market';
import { emfFields, type MetricName } from './metrics';
import { etDate, etParts, etStamp, etWallToUtcMs, isRegularSessionClose } from './time';
import type { TradierApi, TradierOrder } from './tradier';

/** The expected bar must exist, and the run must start, within this long of it becoming available. */
export const MAX_LATENESS_MS = 2 * 60 * 1000;
/** Daily runs go after the close; a run this long after 16:00 ET is too late. */
export const DAILY_MAX_LATENESS_MS = 90 * 60 * 1000;

/**
 * The close of the bar a run at `t` should act on: the latest interval
 * boundary, or for daily bars the latest weekday 16:00 ET (a holiday has no
 * bar, so a run on one finds the data stale and does nothing).
 */
export function expectedBarClose(interval: Interval, t: number): number {
  if (!isDaily(interval)) {
    const ms = INTERVALS[interval] * 60_000;
    return Math.floor(t / ms) * ms;
  }
  for (let back = 0; back < 7; back++) {
    const p = etParts(t - back * 86_400_000);
    const close = etWallToUtcMs(p.year, p.month, p.day, 16, 0);
    const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
    if (weekday !== 0 && weekday !== 6 && close <= t) return close;
  }
  throw new Error('no weekday close in the last week');
}
export const SETTLE_MS = 5 * 1000;
export const FRESHNESS_POLLS = 3;
export const FRESHNESS_POLL_GAP_MS = 5 * 1000;
export const FILL_POLL_MS = 1500;
export const FILL_POLL_ATTEMPTS = 6;

const OPEN_ORDER_STATUSES = new Set(['open', 'partially_filled', 'pending']);
const DEAD_ORDER_STATUSES = new Set(['rejected', 'canceled', 'cancelled', 'expired', 'error']);

export interface Position {
  side: 'long' | 'short';
  shares: number;
  entryPrice: number;
  entryTime: number;
  exitOrderId: string | null;
  /** Realized so far on partial exits of this position. */
  realizedPnl: number;
}

export interface PendingOrder {
  id: string;
  kind: 'entry' | 'exit';
  side: 'long' | 'short';
  orderSide: string;
  quantity: number;
  barTime: number;
  placedAt: number;
  reason: string;
}

export interface DeploymentState {
  pk: string;
  strategyId: string;
  symbol: string;
  position: Position | null;
  pendingOrder: PendingOrder | null;
  lastProcessedBarTime: number | null;
  tradingDay: string | null;
  /** The deployment's equity at its first run: account equity x allocationPct. */
  allocationBase: number | null;
  realizedPnlTotal: number;
  realizedPnlToday: number;
  dayStartEquity: number | null;
  peakEquity: number | null;
  drawdownTripBarTime: number | null;
  entriesAllowedFrom: number | null;
  tradesClosed: number;
  winningTrades: number;
}

export interface StateStore {
  load(pk: string): Promise<Partial<DeploymentState> | null>;
  /** Must fail if a state for this or a later bar was already written. */
  save(state: DeploymentState, barTime: number): Promise<void>;
}

export interface RunDeps {
  /** The deployment's strategy. The Lambda bundles only this one (see handler.ts). */
  strategy: StrategyDefinition;
  tradier: TradierApi;
  store: StateStore;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** Receives the one JSON log line. */
  log: (line: string) => void;
}

export interface RunResult {
  ok: true;
  action: string;
  reason?: string;
  dryRun: boolean;
}

export function freshState(d: ResolvedDeployment): DeploymentState {
  return {
    pk: d.id,
    strategyId: d.strategyId,
    symbol: d.symbol,
    position: null,
    pendingOrder: null,
    lastProcessedBarTime: null,
    tradingDay: null,
    allocationBase: null,
    realizedPnlTotal: 0,
    realizedPnlToday: 0,
    dayStartEquity: null,
    peakEquity: null,
    drawdownTripBarTime: null,
    entriesAllowedFrom: null,
    tradesClosed: 0,
    winningTrades: 0,
  };
}

interface Counters {
  fills: number;
  tradesClosed: number;
  winningTrades: number;
}

export function applyFill(state: DeploymentState, pending: PendingOrder, order: TradierOrder, notes: string[], counters: Counters, nowMs: number): void {
  const qty = Number(order.exec_quantity ?? 0);
  const price = Number(order.avg_fill_price ?? 0);
  if (!(qty > 0)) return;
  if (!(price > 0)) {
    notes.push(`order ${order.id} shows ${qty} filled but no avg_fill_price; leaving state for reconciliation`);
    return;
  }
  counters.fills++;
  if (pending.kind === 'entry') {
    const parsed = order.transaction_date ? Date.parse(order.transaction_date) : NaN;
    state.position = { side: pending.side, shares: qty, entryPrice: price, entryTime: Number.isFinite(parsed) ? parsed : nowMs, exitOrderId: null, realizedPnl: 0 };
    notes.push(`entry ${pending.side} ${qty} @ ${price} filled (order ${order.id})`);
  } else if (state.position) {
    const pos = state.position;
    const dir = pos.side === 'long' ? 1 : -1;
    const closed = Math.min(qty, pos.shares);
    const pnl = (price - pos.entryPrice) * closed * dir;
    state.realizedPnlToday += pnl;
    state.realizedPnlTotal += pnl;
    const remaining = pos.shares - closed;
    const tradePnl = (pos.realizedPnl ?? 0) + pnl;
    notes.push(`exit ${closed} @ ${price} filled (order ${order.id}), realized ${pnl.toFixed(2)}`);
    if (remaining > 0) {
      state.position = { ...pos, shares: remaining, exitOrderId: null, realizedPnl: tradePnl };
    } else {
      state.position = null;
      state.tradesClosed++;
      counters.tradesClosed++;
      if (tradePnl > 0) {
        state.winningTrades++;
        counters.winningTrades++;
      }
    }
  }
}

/** Resolve the pending order: 'filled' | 'waiting' | 'dead'. */
export function resolvePending(state: DeploymentState, order: TradierOrder | null, notes: string[], counters: Counters, nowMs: number): 'filled' | 'waiting' | 'dead' {
  const pending = state.pendingOrder!;
  const status = String(order?.status ?? 'unknown');
  if (status === 'filled') {
    applyFill(state, pending, order!, notes, counters, nowMs);
    state.pendingOrder = null;
    return 'filled';
  }
  if (OPEN_ORDER_STATUSES.has(status)) {
    notes.push(`order ${pending.id} still ${status}; waiting`);
    return 'waiting';
  }
  if (DEAD_ORDER_STATUSES.has(status)) {
    notes.push(`order ${pending.id} ${status}${order?.reason_description ? `: ${order.reason_description}` : ''}`);
    // A partial fill before the cancel still happened.
    if (order) applyFill(state, pending, order, notes, counters, nowMs);
    if (pending.kind === 'exit' && state.position) state.position.exitOrderId = null;
    state.pendingOrder = null;
    return 'dead';
  }
  notes.push(`order ${pending.id} has unrecognized status ${status}; waiting`);
  return 'waiting';
}

export interface RunEvent {
  /** Run everything, place nothing, write no state, publish no metrics. */
  dryRun?: boolean;
  /** Dry run only: evaluate the newest bar even if it's stale (to check a strategy outside market hours). */
  evaluateLatest?: boolean;
}

export async function runDeployment(d: ResolvedDeployment, event: RunEvent | undefined, deps: RunDeps): Promise<RunResult> {
  const { strategy, tradier, store, now, sleep } = deps;
  const dryRun = event?.dryRun === true;
  const evaluateLatest = dryRun && event?.evaluateLatest === true;
  const intervalMs = INTERVALS[d.interval] * 60_000;
  const sourceInterval = SOURCE_INTERVAL[d.interval];
  const daily = isDaily(d.interval);
  const sourceMs = sourceInterval === 'daily' ? intervalMs : INTERVALS[sourceInterval] * 60_000;
  const closeOf = (barTime: number) => (daily ? sessionClose(barTime) : barTime + intervalMs);
  const invokedAt = now();
  const metrics: Partial<Record<MetricName, number | null>> = { Invocations: 1 };
  const log: Record<string, unknown> = {
    level: 'info',
    deployment: d.id,
    strategy: d.strategyId,
    symbol: d.symbol,
    interval: d.interval,
    dryRun,
    invokedAt: new Date(invokedAt).toISOString(),
    params: d.params,
  };
  const counters: Counters = { fills: 0, tradesClosed: 0, winningTrades: 0 };

  try {
    if (strategy?.id !== d.strategyId) throw new Error(`Bundled strategy ${strategy?.id} does not match deployment strategy ${d.strategyId}`);

    // Read the expected bar a few seconds after it becomes available.
    const delay = daily ? 0 : DATA_DELAY_MS;
    let t = now();
    const boundary = expectedBarClose(d.interval, t - delay);
    const availableAt = boundary + delay;
    if (!daily && t - availableAt < SETTLE_MS) {
      await sleep(SETTLE_MS - (t - availableAt));
      t = now();
    }
    log.expectedBarClose = new Date(boundary).toISOString();
    if (delay) log.dataDelayMinutes = delay / 60_000;
    // Bars are complete only once the delayed feed has passed their close.
    const dataNow = () => now() - delay;

    // Reconciliation inputs first.
    const [clock, balances, positions, orders, stored] = await Promise.all([
      tradier.clock(),
      tradier.balances(),
      tradier.positions(),
      tradier.orders(),
      store.load(d.id),
    ]);
    const state: DeploymentState = { ...freshState(d), ...(stored ?? {}) };
    log.stateBefore = stored;
    log.clock = clock ? { state: clock.state, description: clock.description } : null;
    const accountEquity = Number(balances?.total_equity);
    log.accountEquity = accountEquity;
    metrics.AccountEquity = accountEquity;

    // Market data, polled briefly for the just-closed bar.
    let data: ParsedBars & { droppedIncomplete?: number } = parseBars([], sourceMs, now());
    for (let k = 0; k < FRESHNESS_POLLS; k++) {
      const end = now();
      const start = etDate(end - d.historyDays * 86_400_000);
      if (sourceInterval === 'daily') {
        data = parseDailyBars(await tradier.history({ symbol: d.symbol, start, end: etDate(end) }), now());
      } else {
        const rows = await tradier.timesales({ symbol: d.symbol, interval: sourceInterval, start: `${start} 00:00`, end: etStamp(end) });
        const parsed = parseBars(rows, sourceMs, dataNow());
        const agg = aggregateBars(parsed.bars, sourceMs, intervalMs, dataNow());
        data = { ...parsed, bars: agg.bars, droppedIncomplete: agg.droppedIncomplete };
      }
      const newest = data.bars[data.bars.length - 1];
      if (newest && closeOf(newest.time) >= boundary) break;
      if (k < FRESHNESS_POLLS - 1) await sleep(FRESHNESS_POLL_GAP_MS);
    }
    const bars = data.bars;
    log.data = { sourceInterval, rawBars: data.rawCount, invalidBars: data.invalid, droppedForming: data.droppedForming, droppedIncomplete: data.droppedIncomplete ?? 0, completedBars: bars.length };

    const skip = (reason: string, stale = false): RunResult => {
      log.action = 'none';
      log.why = reason;
      metrics.Skipped = 1;
      if (stale) metrics.StaleData = 1;
      return { ok: true, action: 'none', reason, dryRun };
    };

    // --- Data quality gates.
    if (bars.length === 0) return skip('no completed bars returned', true);
    const newest = bars[bars.length - 1];
    const barClose = closeOf(newest.time);
    metrics.BarLagSeconds = Math.round((now() - barClose) / 1000);
    log.bar = { time: new Date(newest.time).toISOString(), closeTime: new Date(barClose).toISOString(), open: newest.open, high: newest.high, low: newest.low, close: newest.close, volume: newest.volume };
    if (evaluateLatest) {
      log.evaluateLatest = true;
    } else {
      if (barClose < boundary) return skip(`stale data: newest completed bar closed ${new Date(barClose).toISOString()}, expected ${new Date(boundary).toISOString()}`, true);
      if (invokedAt - availableAt > (daily ? DAILY_MAX_LATENESS_MS : MAX_LATENESS_MS)) return skip(`invoked ${Math.round((invokedAt - availableAt) / 1000)}s after the bar became available; too late to act on it`, true);
    }
    if (bars.length < d.minBars) return skip(`only ${bars.length} completed bars; need ${d.minBars} for warm indicators`);
    if (!(accountEquity > 0)) return skip(`balances returned no usable total_equity (${balances?.total_equity})`);

    const duplicate = state.lastProcessedBarTime != null && newest.time <= state.lastProcessedBarTime;
    if (duplicate && !dryRun) return skip(`bar ${log.bar && (log.bar as { time: string }).time} already processed`);
    if (duplicate) log.duplicateBar = true;

    // --- Indicators and the signal, from the engine and the strategy itself.
    const series = computeSeries(bars, d.strategyId, d.params);
    const index = series.length - 1;
    const current = series[index];
    const previous = series[index - 1] ?? null;

    // --- Reconcile. Tradier wins.
    const notes: string[] = [];
    let blockTrading: string | null = null;
    const nowMs = now();

    if (state.allocationBase == null) {
      state.allocationBase = accountEquity * (d.allocationPct / 100);
      notes.push(`first run: allocation ${d.allocationPct}% of ${accountEquity} = ${state.allocationBase.toFixed(2)}`);
    }

    const unrealizedAt = (price: number) => (state.position ? (price - state.position.entryPrice) * state.position.shares * (state.position.side === 'long' ? 1 : -1) : 0);

    // Day roll (US/Eastern), before any fill adds realized P&L.
    const today = etDate(nowMs);
    if (state.tradingDay !== today || state.dayStartEquity == null) {
      state.tradingDay = today;
      state.realizedPnlToday = 0;
      state.dayStartEquity = state.allocationBase + state.realizedPnlTotal + unrealizedAt(current.close);
      notes.push(`new trading day ${today}, starting equity ${state.dayStartEquity.toFixed(2)}`);
    }

    if (state.pendingOrder) {
      let order: TradierOrder | null = null;
      try {
        order = await tradier.order(state.pendingOrder.id);
      } catch (err) {
        if ((err as { status?: number }).status === 404) order = { id: state.pendingOrder.id, status: 'error', exec_quantity: 0 };
        else throw err;
      }
      if (resolvePending(state, order, notes, counters, nowMs) === 'waiting') blockTrading = `order ${state.pendingOrder?.id} still pending`;
    }

    const tPos = positions.find((p) => p.symbol === d.symbol);
    const tQty = tPos ? Number(tPos.quantity) : 0;
    const sQty = state.position ? (state.position.side === 'long' ? 1 : -1) * state.position.shares : 0;
    const openForSymbol = orders.filter((o) => o.symbol === d.symbol && OPEN_ORDER_STATUSES.has(String(o.status)));
    const unknownOpen = openForSymbol.filter((o) => String(o.id) !== String(state.pendingOrder?.id ?? ''));
    log.tradier = { positionQty: tQty, openOrders: openForSymbol.map((o) => ({ id: o.id, side: o.side, status: o.status, qty: o.quantity, tag: o.tag })) };

    if (!blockTrading && tQty !== sQty) {
      const msg = `RECONCILIATION MISMATCH: Tradier holds ${tQty} ${d.symbol}, DynamoDB says ${sQty}. Trusting Tradier and skipping trading this bar.`;
      log.level = 'warn';
      log.mismatch = msg;
      metrics.ReconciliationMismatch = 1;
      state.position =
        tQty === 0 || !tPos
          ? null
          : {
              side: tQty > 0 ? 'long' : 'short',
              shares: Math.abs(tQty),
              entryPrice: Math.abs(Number(tPos.cost_basis) / tQty),
              entryTime: tPos.date_acquired ? Date.parse(tPos.date_acquired) : nowMs,
              exitOrderId: null,
              realizedPnl: 0,
            };
      blockTrading = 'reconciliation mismatch';
    }
    if (unknownOpen.length > 0) {
      const msg = `RECONCILIATION MISMATCH: Tradier has open ${d.symbol} orders DynamoDB doesn't know about (${unknownOpen.map((o) => o.id).join(', ')}). Skipping trading this bar.`;
      log.level = 'warn';
      log.mismatch = (log.mismatch ? `${log.mismatch} ` : '') + msg;
      metrics.ReconciliationMismatch = 1;
      blockTrading ??= 'unknown open orders';
    }

    // --- The deployment's own equity, marked to this bar's close.
    const realizedEquity = state.allocationBase + state.realizedPnlTotal;
    const equity = realizedEquity + unrealizedAt(current.close);

    const positionSide = state.position ? state.position.side : null;
    const signal = strategy.handler({ current, previous, index, series, params: d.params, position: positionSide });
    log.signal = { action: signal.action, reason: signal.reason, positionGoingIn: positionSide };
    log.indicators = Object.fromEntries(
      Object.entries(current).filter(([k, v]) => typeof v === 'number' && !['time', 'open', 'high', 'low', 'close', 'volume'].includes(k)),
    );
    metrics.Signal = signal.action === 'buy' ? 1 : signal.action === 'sell' ? -1 : 0;

    // --- Decide. Step 1: strategy exit. Step 2: entry (flat, no exit this bar).
    type Decision = { kind: 'entry' | 'exit'; side: 'long' | 'short'; orderSide: string; quantity: number; reason: string };
    let decision: Decision | null = null;
    const why: string[] = [];

    const barsSinceTrip = state.drawdownTripBarTime != null ? series.filter((b) => b.time > state.drawdownTripBarTime!).length : Infinity;
    const entriesPaused = barsSinceTrip < d.drawdownPauseBars;
    const dailyLossLimit = (d.maxDailyLossPct / 100) * (state.dayStartEquity ?? equity);
    const dailyLossHit = state.realizedPnlToday <= -dailyLossLimit;

    if (blockTrading) {
      why.push(`trading blocked: ${blockTrading}`);
    } else if (state.position && ((signal.action === 'sell' && positionSide === 'long') || (signal.action === 'buy' && positionSide === 'short'))) {
      decision = { kind: 'exit', side: state.position.side, orderSide: state.position.side === 'long' ? 'sell' : 'buy_to_cover', quantity: state.position.shares, reason: signal.reason };
    } else if (!state.position && (signal.action === 'buy' || (signal.action === 'sell' && d.enableShorts))) {
      const side = signal.action === 'buy' ? 'long' : 'short';
      const shares = Math.floor((realizedEquity * (d.positionSizePct / 100)) / current.close + 1e-9);
      if (entriesPaused) why.push(`entry ${side} skipped: drawdown pause, ${barsSinceTrip}/${d.drawdownPauseBars} bars since the limit tripped`);
      else if (dailyLossHit) why.push(`entry ${side} skipped: daily loss ${state.realizedPnlToday.toFixed(2)} reached ${d.maxDailyLossPct}% of ${state.dayStartEquity}`);
      else if (!(shares > 0)) why.push(`entry ${side} skipped: size is 0 shares (equity ${realizedEquity}, close ${current.close})`);
      else decision = { kind: 'entry', side, orderSide: side === 'long' ? 'buy' : 'sell_short', quantity: shares, reason: signal.reason };
    } else if (signal.action !== 'hold') {
      why.push(`signal ${signal.action} ignored with position ${positionSide ?? 'flat'}${signal.action === 'sell' && !positionSide ? ' (shorts disabled)' : ''}`);
    } else {
      why.push('hold');
    }

    // --- Step 3: drawdown limit, last.
    let cancelIds: string[] = [];
    if (state.peakEquity == null || equity > state.peakEquity) state.peakEquity = equity;
    const tripCheckAllowed = barsSinceTrip >= d.drawdownPauseBars + 1;
    const drawdownFloor = state.peakEquity * (1 - d.drawdownLimitPct / 100);
    const drawdownPct = state.peakEquity > 0 ? ((state.peakEquity - equity) / state.peakEquity) * 100 : 0;
    log.drawdown = { equity, peakEquity: state.peakEquity, floor: drawdownFloor, drawdownPct, barsSinceTrip: Number.isFinite(barsSinceTrip) ? barsSinceTrip : null };
    if (tripCheckAllowed && equity <= drawdownFloor) {
      if (blockTrading) {
        why.push(`drawdown limit reached (equity ${equity.toFixed(2)} <= ${drawdownFloor.toFixed(2)}) but trading is blocked; will re-check next bar`);
      } else {
        why.push(`drawdown limit ${d.drawdownLimitPct}% reached (equity ${equity.toFixed(2)} <= ${drawdownFloor.toFixed(2)}); sitting out ${d.drawdownPauseBars} bars`);
        cancelIds = openForSymbol.map((o) => String(o.id));
        decision = state.position
          ? { kind: 'exit', side: state.position.side, orderSide: state.position.side === 'long' ? 'sell' : 'buy_to_cover', quantity: state.position.shares, reason: `Max drawdown ${d.drawdownLimitPct}% reached; sitting out ${d.drawdownPauseBars} bars` }
          : null;
        state.drawdownTripBarTime = newest.time;
        state.entriesAllowedFrom = newest.time + (d.drawdownPauseBars + 1) * intervalMs;
        state.peakEquity = equity;
      }
    }

    // --- Orders only in regular hours (market orders are regular-session only).
    // Intraday: market orders only while the regular session is open. Daily:
    // the run comes after the close and the day order fills at the next open,
    // which is where the backtest fills too.
    const regularHours = daily || (clock?.state === 'open' && isRegularSessionClose(barClose));
    log.regularHours = regularHours;
    if (daily) log.orderTiming = 'placed after the close; fills at the next open';

    const ordersPlaced: unknown[] = [];
    const wouldPlace: unknown[] = [];
    if (decision) {
      const tag = `${d.id}-${newest.time}`.slice(0, 255);
      const intended = { kind: decision.kind, side: decision.orderSide, quantity: decision.quantity, type: 'market', duration: 'day', reason: decision.reason, cancelFirst: cancelIds, tag };
      if (dryRun || !regularHours) {
        wouldPlace.push(intended);
        why.push(dryRun ? 'dry run: no orders placed' : 'outside regular hours: logged what it would have done');
      } else {
        for (const id of cancelIds) {
          await tradier.cancelOrder(id);
          ordersPlaced.push({ cancelled: id });
        }
        const orderId = await tradier.placeMarketOrder({ symbol: d.symbol, side: decision.orderSide, quantity: decision.quantity, tag });
        ordersPlaced.push({ ...intended, orderId });
        state.pendingOrder = { id: orderId, kind: decision.kind, side: decision.side, orderSide: decision.orderSide, quantity: decision.quantity, barTime: newest.time, placedAt: now(), reason: decision.reason };
        if (decision.kind === 'exit' && state.position) state.position.exitOrderId = orderId;
        let order: TradierOrder | null = null;
        for (let k = 0; k < FILL_POLL_ATTEMPTS; k++) {
          await sleep(FILL_POLL_MS);
          order = await tradier.order(orderId);
          const st = String(order?.status ?? '');
          if (st === 'filled' || DEAD_ORDER_STATUSES.has(st)) break;
        }
        resolvePending(state, order, notes, counters, now());
      }
    }

    // Metrics after fills, marked to the bar's close.
    const unrealized = unrealizedAt(current.close);
    metrics.StrategyEquity = state.allocationBase + state.realizedPnlTotal + unrealized;
    metrics.RealizedPnlTotal = state.realizedPnlTotal;
    metrics.RealizedPnlToday = state.realizedPnlToday;
    metrics.UnrealizedPnl = unrealized;
    metrics.DrawdownPct = state.peakEquity > 0 ? Math.max(0, ((state.peakEquity - metrics.StrategyEquity) / state.peakEquity) * 100) : 0;
    metrics.PositionShares = state.position ? (state.position.side === 'long' ? 1 : -1) * state.position.shares : 0;
    metrics.OrdersPlaced = ordersPlaced.filter((o) => (o as { orderId?: string }).orderId).length;
    metrics.BarsProcessed = 1;

    log.action = decision ? `${decision.kind} ${decision.side}` : 'none';
    log.why = why.join('; ');
    log.notes = notes;
    log.ordersPlaced = ordersPlaced;
    log.wouldPlace = wouldPlace;
    log.limits = { maxDailyLossPct: d.maxDailyLossPct, realizedPnlToday: state.realizedPnlToday, dayStartEquity: state.dayStartEquity, dailyLossHit, entriesPaused };
    log.stateAfter = state;

    if (!dryRun) {
      await store.save(state, newest.time);
      log.stateWritten = true;
    } else {
      log.stateWritten = false;
    }
    return { ok: true, action: String(log.action), dryRun };
  } catch (err) {
    const e = err as Error & { status?: number };
    log.level = 'error';
    log.error = { name: e?.name, message: e?.message, status: e?.status, stack: e?.stack?.split('\n').slice(0, 5).join(' | ') };
    metrics.Errors = 1;
    throw err;
  } finally {
    metrics.Fills = counters.fills;
    metrics.TradesClosed = counters.tradesClosed;
    metrics.WinningTrades = counters.winningTrades;
    log.durationMs = now() - invokedAt;
    // Dry runs log the same line without metrics, so they never show on the dashboard.
    deps.log(JSON.stringify(dryRun ? log : { ...log, ...emfFields(d.id, metrics, invokedAt) }));
  }
}
