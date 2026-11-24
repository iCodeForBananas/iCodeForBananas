// Tearing down a deleted deployment: cancel its open order, close its position
// at market, and report it flat so the dispatcher can delete its row. Runs on
// every dispatcher tick for each row with teardown_requested_at set, until
// the deployment is flat. Market orders go only while the market is open, so
// a delete after hours closes the position at the next open.
//
// Whose shares are closed: the deployment's own. Tradier holds one net
// position per symbol, so when no enabled deployment trades the symbol, all of
// Tradier's position there is this deployment's (Tradier wins, as in
// runDeployment's reconciliation). When another one does, only the shares
// this deployment's state says it holds are closed, and never more than
// Tradier holds.

import { resolveDeployment } from './config';
import { rowToDeployment, type AppDeploymentRow } from './app-deployments';
import type { FillRecord } from './equity-report';
import { DEAD_ORDER_STATUSES, FILL_POLL_ATTEMPTS, FILL_POLL_MS, OPEN_ORDER_STATUSES, freshState, newCounters, resolvePending, type DeploymentState, type RunDeps } from './run';
import type { TradierOrder } from './tradier';

export interface TeardownResult {
  /** 'flat': nothing left, the row can go. 'closing': an order is working or the market is shut; try again next tick. */
  status: 'flat' | 'closing';
  action: string;
  reason: string;
}

const signed = (s: DeploymentState) => (s.position ? (s.position.side === 'long' ? 1 : -1) * s.position.shares : 0);

/**
 * @param sharedSymbol another enabled deployment trades this symbol, so the
 *   Tradier position isn't all this one's.
 */
export async function teardownDeployment(
  row: AppDeploymentRow,
  sharedSymbol: boolean,
  dryRun: boolean,
  deps: Omit<RunDeps, 'strategy'>,
): Promise<TeardownResult> {
  const { tradier, store, now, sleep } = deps;
  const d = resolveDeployment(rowToDeployment(row));
  const notes: string[] = [];
  const counters = newCounters();
  const log: Record<string, unknown> = { level: 'info', teardown: true, deployment: d.id, symbol: d.symbol, dryRun };

  try {
    const [clock, positions, orders, stored] = await Promise.all([tradier.clock(), tradier.positions(), tradier.orders(), store.load(d.id)]);
    const state: DeploymentState = { ...freshState(d), ...(stored ?? {}) };
    const before = JSON.stringify(state);
    log.stateBefore = stored;

    // 1. Its own working orders: the one its state knows about, and any other
    // open order on the symbol tagged with its id. Cancel, then settle what filled.
    const mine = (o: TradierOrder) => o.symbol === d.symbol && OPEN_ORDER_STATUSES.has(String(o.status)) && String(o.tag ?? '').startsWith(d.id);
    const toCancel = new Set(orders.filter(mine).map((o) => String(o.id)));
    if (state.pendingOrder) toCancel.add(state.pendingOrder.id);
    for (const id of toCancel) {
      const open = orders.find((o) => String(o.id) === id);
      if (open && !OPEN_ORDER_STATUSES.has(String(open.status))) continue;
      if (dryRun) {
        notes.push(`would cancel order ${id}`);
        continue;
      }
      try {
        await tradier.cancelOrder(id);
        notes.push(`cancelled order ${id}`);
      } catch (err) {
        // Already filled or gone: resolving it below says which.
        notes.push(`cancel of order ${id} failed: ${(err as Error).message}`);
      }
    }
    if (state.pendingOrder && !dryRun) {
      let order: TradierOrder | null = null;
      try {
        order = await tradier.order(state.pendingOrder.id);
      } catch (err) {
        if ((err as { status?: number }).status === 404) order = { id: state.pendingOrder.id, status: 'error', exec_quantity: 0 };
        else throw err;
      }
      if (resolvePending(state, order, notes, counters, now()) === 'waiting') {
        return await finish({ status: 'closing', action: 'cancelling', reason: `order ${state.pendingOrder?.id} is still working; cancel requested` }, state, before);
      }
    }

    // 2. What to close.
    const tPos = positions.find((p) => p.symbol === d.symbol);
    const tQty = tPos ? Number(tPos.quantity) : 0;
    const sQty = signed(state);
    let closeQty: number;
    if (!sharedSymbol) {
      closeQty = tQty;
      if (tQty !== sQty) {
        notes.push(`Tradier holds ${tQty} ${d.symbol}, state says ${sQty}; closing what Tradier holds`);
        state.position =
          tQty === 0 || !tPos
            ? null
            : {
                side: tQty > 0 ? 'long' : 'short',
                shares: Math.abs(tQty),
                entryPrice: Math.abs(Number(tPos.cost_basis) / tQty),
                entryTime: tPos.date_acquired ? Date.parse(tPos.date_acquired) : now(),
                exitOrderId: null,
                realizedPnl: 0,
              };
      }
    } else {
      closeQty = Math.sign(sQty) === Math.sign(tQty) ? Math.sign(sQty) * Math.min(Math.abs(sQty), Math.abs(tQty)) : 0;
      if (closeQty !== sQty) {
        notes.push(`another deployment trades ${d.symbol}; Tradier holds ${tQty}, state says ${sQty}, closing ${closeQty}`);
        if (state.position) {
          if (closeQty === 0) state.position = null;
          else state.position = { ...state.position, shares: Math.abs(closeQty) };
        }
      }
    }
    log.positions = { tradier: tQty, state: sQty, closing: closeQty };

    if (closeQty === 0) return await finish({ status: 'flat', action: 'flat', reason: notes.join('; ') || 'no position' }, state, before);

    const orderSide = closeQty > 0 ? 'sell' : 'buy_to_cover';
    const quantity = Math.abs(closeQty);
    if (dryRun) return await finish({ status: 'closing', action: `would ${orderSide} ${quantity}`, reason: 'dry run' }, state, before);
    if (clock?.state !== 'open') {
      return await finish({ status: 'closing', action: 'waiting', reason: `market is ${clock?.state ?? 'unknown'}; closes ${quantity} ${d.symbol} at the next open` }, state, before);
    }

    // 3. Close at market and wait briefly for the fill.
    const placedAt = now();
    const tag = `${d.id}-teardown-${placedAt}`.slice(0, 255);
    const orderId = await tradier.placeMarketOrder({ symbol: d.symbol, side: orderSide, quantity, tag });
    notes.push(`placed ${orderSide} ${quantity} ${d.symbol} (order ${orderId})`);
    state.pendingOrder = { id: orderId, kind: 'exit', side: closeQty > 0 ? 'long' : 'short', orderSide, quantity, barTime: placedAt, placedAt, reason: 'Deployment deleted: closing its position' };
    if (state.position) state.position.exitOrderId = orderId;
    let order: TradierOrder | null = null;
    for (let k = 0; k < FILL_POLL_ATTEMPTS; k++) {
      await sleep(FILL_POLL_MS);
      order = await tradier.order(orderId);
      const st = String(order?.status ?? '');
      if (st === 'filled' || DEAD_ORDER_STATUSES.has(st)) break;
    }
    resolvePending(state, order, notes, counters, now());
    const flat = !state.position && !state.pendingOrder;
    return await finish(
      flat
        ? { status: 'flat', action: `closed ${orderSide} ${quantity}`, reason: notes.join('; ') }
        : { status: 'closing', action: `${orderSide} ${quantity} working`, reason: notes.join('; ') },
      state,
      before,
    );
  } catch (err) {
    log.level = 'error';
    log.error = (err as Error).message;
    throw err;
  } finally {
    log.notes = notes;
    deps.log(JSON.stringify(log));
  }

  /** Saves a changed state and reports its fills, then returns the result. */
  async function finish(result: TeardownResult, state: DeploymentState, before: string): Promise<TeardownResult> {
    Object.assign(log, { result, stateAfter: state });
    if (dryRun || JSON.stringify(state) === before) return result;
    const t = now();
    await store.save(state, Math.max(t, (state.lastProcessedBarTime ?? 0) + 1));
    const fills: FillRecord[] = counters.records.map((r) => ({ ...r, deploymentId: d.id, strategyId: d.strategyId, symbol: d.symbol, interval: d.interval, source: 'live' }));
    if (fills.length) log.fills = fills;
    if (deps.equityReporter && fills.length) {
      const failed: string[] = [];
      for (const f of fills) await deps.equityReporter.reportFill(f).catch((e: Error) => failed.push(`order ${f.orderId}: ${e.message}`));
      if (failed.length) log.fillReportErrors = failed;
      // The curve ends where the position closed.
      const last = fills[fills.length - 1];
      await deps.equityReporter
        .report({
          deploymentId: d.id,
          barTime: last.fillTime,
          strategyId: d.strategyId,
          symbol: d.symbol,
          interval: d.interval,
          equity: last.equityAfter,
          realizedPnl: state.realizedPnlTotal,
          unrealizedPnl: 0,
          positionShares: signed(state),
          tradesClosed: state.tradesClosed,
          winningTrades: state.winningTrades,
        })
        .catch((e: Error) => (log.equityReportError = e.message));
    }
    return result;
  }
}
