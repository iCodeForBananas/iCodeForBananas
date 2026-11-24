import { describe, expect, it } from 'vitest';
import { deploymentToRow, type AppDeploymentRow } from './app-deployments';
import type { DeploymentState, Position } from './run';
import { teardownDeployment } from './teardown';
import type { TradierApi, TradierOrder, TradierPosition } from './tradier';

const row: AppDeploymentRow = {
  ...deploymentToRow({
    strategyId: 'ibs-mean-reversion',
    symbol: 'ZZZ',
    interval: '15min',
    params: { entryIbs: 20, exitIbs: 80, trendFilter: false },
    enableShorts: true,
    startingEquity: 10_000,
    positionSizePct: 100,
    maxDailyLossPct: 100,
    drawdownLimitPct: 25,
    drawdownPauseBars: 20,
    minBars: 50,
    historyDays: 10,
  }),
  enabled: false,
  teardown_requested_at: '2026-11-23T15:00:00Z',
};

const long = (shares: number, entryPrice = 100): Position => ({ side: 'long', shares, entryPrice, entryTime: 0, exitOrderId: null, realizedPnl: 0 });

function setup(o: { clock?: string; positions?: TradierPosition[]; orders?: TradierOrder[]; state?: Partial<DeploymentState>; fill?: Partial<TradierOrder> }) {
  const placed: { symbol: string; side: string; quantity: number; tag: string }[] = [];
  const cancelled: string[] = [];
  const saved: DeploymentState[] = [];
  const fills: unknown[] = [];
  const tradier = {
    clock: async () => ({ state: o.clock ?? 'open' }),
    positions: async () => o.positions ?? [],
    orders: async () => o.orders ?? [],
    placeMarketOrder: async (p: (typeof placed)[number]) => {
      placed.push(p);
      return '900';
    },
    cancelOrder: async (id: string) => void cancelled.push(id),
    order: async (id: string) => (id === '900' ? { id, status: 'filled', exec_quantity: placed[0]?.quantity, avg_fill_price: 110, ...o.fill } : { id, status: 'canceled', exec_quantity: 0 }),
  } as unknown as TradierApi;
  const deps = {
    tradier,
    store: { load: async () => ({ pk: row.id, ...o.state }), save: async (s: DeploymentState) => void saved.push(structuredClone(s)) },
    now: () => 1_000_000,
    sleep: async () => {},
    log: () => {},
    equityReporter: { report: async () => {}, reportFill: async (f: unknown) => void fills.push(f) },
  };
  return { deps, placed, cancelled, saved, fills };
}

describe('teardownDeployment', () => {
  it('is flat at once when it holds nothing', async () => {
    const { deps, placed, saved } = setup({});
    expect(await teardownDeployment(row, false, false, deps)).toMatchObject({ status: 'flat' });
    expect(placed).toEqual([]);
    expect(saved).toEqual([]);
  });

  it('sells a long position at market and reports the closing fill', async () => {
    const { deps, placed, saved, fills } = setup({ positions: [{ symbol: 'ZZZ', quantity: 10, cost_basis: 1000 }], state: { position: long(10), allocationBase: 10_000 } });
    expect(await teardownDeployment(row, false, false, deps)).toMatchObject({ status: 'flat', action: 'closed sell 10' });
    expect(placed).toEqual([expect.objectContaining({ symbol: 'ZZZ', side: 'sell', quantity: 10 })]);
    expect(saved.at(-1)).toMatchObject({ position: null, pendingOrder: null, realizedPnlTotal: 100 });
    expect(fills).toEqual([expect.objectContaining({ action: 'close', shares: 10, realizedPnl: 100 })]);
  });

  it('covers a short position', async () => {
    const { deps, placed } = setup({ positions: [{ symbol: 'ZZZ', quantity: -5, cost_basis: -500 }] });
    await teardownDeployment(row, false, false, deps);
    expect(placed[0]).toMatchObject({ side: 'buy_to_cover', quantity: 5 });
  });

  it('waits for the open when the market is closed', async () => {
    const { deps, placed } = setup({ clock: 'closed', positions: [{ symbol: 'ZZZ', quantity: 10, cost_basis: 1000 }], state: { position: long(10) } });
    expect(await teardownDeployment(row, false, false, deps)).toMatchObject({ status: 'closing', action: 'waiting' });
    expect(placed).toEqual([]);
  });

  it('cancels its own working order first', async () => {
    const orders = [{ id: '42', symbol: 'ZZZ', status: 'open', tag: `${row.id}-123` }, { id: '43', symbol: 'ZZZ', status: 'open', tag: 'someone-else' }];
    const { deps, cancelled } = setup({ orders });
    expect(await teardownDeployment(row, false, false, deps)).toMatchObject({ status: 'flat' });
    expect(cancelled).toEqual(['42']);
  });

  it('closes only its own shares when another deployment trades the symbol', async () => {
    const { deps, placed } = setup({ positions: [{ symbol: 'ZZZ', quantity: 30, cost_basis: 3000 }], state: { position: long(10) } });
    await teardownDeployment(row, true, false, deps);
    expect(placed[0]).toMatchObject({ side: 'sell', quantity: 10 });
  });

  it('keeps going next tick when the close has not filled', async () => {
    const { deps } = setup({ positions: [{ symbol: 'ZZZ', quantity: 10, cost_basis: 1000 }], state: { position: long(10) }, fill: { status: 'open', exec_quantity: 0 } });
    expect(await teardownDeployment(row, false, false, deps)).toMatchObject({ status: 'closing' });
  });

  it('places nothing on a dry run', async () => {
    const { deps, placed, saved } = setup({ positions: [{ symbol: 'ZZZ', quantity: 10, cost_basis: 1000 }], state: { position: long(10) } });
    expect(await teardownDeployment(row, false, true, deps)).toMatchObject({ status: 'closing', action: 'would sell 10' });
    expect(placed).toEqual([]);
    expect(saved).toEqual([]);
  });
});
