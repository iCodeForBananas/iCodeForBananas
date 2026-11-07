import { describe, expect, it } from 'vitest';
import { resolveDeployment, type ResolvedDeployment } from './config';
import { runDeployment, type DeploymentState, type RunDeps, type RunEvent } from './run';
import { etParts, etWallToUtcMs } from './time';
import type { TradierApi, TradierOrder, TradierPosition, TimesalesRow } from './tradier';

const BAR = 15 * 60_000;
// Monday 2026-11-09 10:00 ET, a regular-session bar close.
const BOUNDARY = etWallToUtcMs(2026, 11, 9, 10, 0);

const DEPLOYMENT = resolveDeployment({
  id: 'ibs-qqq-test',
  strategyId: 'ibs-mean-reversion',
  symbol: 'QQQ',
  interval: '15min',
  params: { entryIbs: 20, exitIbs: 50, trendFilter: false },
  enableShorts: true,
  allocationPct: 100,
});

const etIso = (ms: number) => {
  const p = etParts(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:00`;
};

/** 400 bars ending with the one that closes at `lastClose`, its IBS set by `lastIbs`. */
function makeRows({ lastIbs, lastClose = BOUNDARY, count = 400, price = 100 }: { lastIbs: number; lastClose?: number; count?: number; price?: number }): TimesalesRow[] {
  const rows: TimesalesRow[] = [];
  for (let i = count; i >= 1; i--) {
    const t = lastClose - i * BAR;
    const last = i === 1;
    const low = price - 1;
    const high = price + 1;
    const close = last ? low + lastIbs * (high - low) : price + Math.sin(i) * 0.5;
    rows.push({ time: etIso(t), open: price, high, low, close, volume: 1000 });
  }
  return rows;
}

interface FakeOpts {
  rows: TimesalesRow[];
  equity?: number;
  clockState?: string;
  positions?: TradierPosition[];
  orders?: TradierOrder[];
  /** Status a newly placed order reports. */
  placedStatus?: string;
  fillPrice?: number;
  orderLookup?: Record<string, TradierOrder>;
}

function fakeTradier(o: FakeOpts) {
  const placed: { symbol: string; side: string; quantity: number; tag: string }[] = [];
  const cancelled: string[] = [];
  const orders = new Map<string, TradierOrder>(Object.entries(o.orderLookup ?? {}));
  let nextId = 1000;
  const api: TradierApi = {
    accountId: async () => 'VA-TEST',
    clock: async () => ({ state: o.clockState ?? 'open', description: 'test' }),
    balances: async () => ({ total_equity: o.equity ?? 100_000 }),
    positions: async () => o.positions ?? [],
    orders: async () => o.orders ?? [],
    order: async (id) => orders.get(id) ?? null,
    async placeMarketOrder(p) {
      placed.push(p);
      const id = String(nextId++);
      const status = o.placedStatus ?? 'filled';
      const last = o.rows[o.rows.length - 1];
      orders.set(id, { id, status, exec_quantity: status === 'filled' ? p.quantity : 0, avg_fill_price: o.fillPrice ?? Number(last.close) });
      return id;
    },
    async cancelOrder(id) {
      cancelled.push(id);
    },
    timesales: async () => o.rows,
  };
  return { api, placed, cancelled };
}

function harness(opts: FakeOpts & { state?: Partial<DeploymentState>; startAt?: number }) {
  const tradier = fakeTradier(opts);
  let clock = opts.startAt ?? BOUNDARY + 6_000;
  const saved: { state: DeploymentState; barTime: number }[] = [];
  const lines: Record<string, unknown>[] = [];
  const deps: RunDeps = {
    tradier: tradier.api,
    store: {
      load: async () => (opts.state ? { pk: DEPLOYMENT.id, ...opts.state } : null),
      save: async (state, barTime) => {
        saved.push({ state: structuredClone(state), barTime });
      },
    },
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    log: (line) => lines.push(JSON.parse(line)),
  };
  const run = (event?: RunEvent, d: ResolvedDeployment = DEPLOYMENT) => runDeployment(d, event, deps);
  return { run, ...tradier, saved, lines, log: () => lines[lines.length - 1] };
}

const lastBarTime = BOUNDARY - BAR;
const metricNames = (line: Record<string, unknown>) =>
  ((line._aws as { CloudWatchMetrics: { Metrics: { Name: string }[] }[] } | undefined)?.CloudWatchMetrics[0].Metrics ?? []).map((m) => m.Name);

describe('runDeployment', () => {
  it('enters long on a low IBS close, sized to the allocation, and records the fill', async () => {
    const h = harness({ rows: makeRows({ lastIbs: 0.1 }) });
    const r = await h.run();
    expect(r.action).toBe('entry long');
    expect(h.placed).toHaveLength(1);
    const close = 99 + 0.1 * 2;
    expect(h.placed[0]).toMatchObject({ symbol: 'QQQ', side: 'buy', quantity: Math.floor(100_000 / close) });
    const s = h.saved[0];
    expect(s.barTime).toBe(lastBarTime);
    expect(s.state.position).toMatchObject({ side: 'long', shares: Math.floor(100_000 / close) });
    expect(s.state.allocationBase).toBe(100_000);
    const line = h.log();
    expect(line.Deployment).toBe(DEPLOYMENT.id);
    expect(line.OrdersPlaced).toBe(1);
    expect(line.Fills).toBe(1);
    expect(line.Signal).toBe(1);
    expect(metricNames(line)).toEqual(expect.arrayContaining(['StrategyEquity', 'PositionShares', 'BarLagSeconds', 'Invocations']));
  });

  it('skips a bar it already processed', async () => {
    const h = harness({ rows: makeRows({ lastIbs: 0.1 }), state: { lastProcessedBarTime: lastBarTime, allocationBase: 100_000 } });
    const r = await h.run();
    expect(r.action).toBe('none');
    expect(r.reason).toMatch(/already processed/);
    expect(h.placed).toHaveLength(0);
    expect(h.saved).toHaveLength(0);
    expect(h.log().Skipped).toBe(1);
  });

  it('exits a long on a high IBS close, books the P&L and does not reverse on the same bar', async () => {
    const h = harness({
      rows: makeRows({ lastIbs: 0.95 }),
      positions: [{ symbol: 'QQQ', quantity: 100, cost_basis: 9500 }],
      state: { allocationBase: 100_000, position: { side: 'long', shares: 100, entryPrice: 95, entryTime: 0, exitOrderId: null, realizedPnl: 0 } },
    });
    const r = await h.run();
    expect(r.action).toBe('exit long');
    expect(h.placed).toEqual([expect.objectContaining({ side: 'sell', quantity: 100 })]);
    const s = h.saved[0].state;
    const close = 99 + 0.95 * 2;
    expect(s.position).toBeNull();
    expect(s.realizedPnlTotal).toBeCloseTo((close - 95) * 100, 6);
    expect(s.tradesClosed).toBe(1);
    expect(s.winningTrades).toBe(1);
    expect(h.log().TradesClosed).toBe(1);
    expect(h.log().WinningTrades).toBe(1);
  });

  it('opens a short with sell_short when shorts are on, and covers with buy_to_cover', async () => {
    const h = harness({ rows: makeRows({ lastIbs: 0.95 }) });
    await h.run();
    expect(h.placed[0]).toMatchObject({ side: 'sell_short' });

    const cover = harness({
      rows: makeRows({ lastIbs: 0.05 }),
      positions: [{ symbol: 'QQQ', quantity: -50, cost_basis: -5000 }],
      state: { allocationBase: 100_000, position: { side: 'short', shares: 50, entryPrice: 100, entryTime: 0, exitOrderId: null, realizedPnl: 0 } },
    });
    await cover.run();
    expect(cover.placed).toEqual([expect.objectContaining({ side: 'buy_to_cover', quantity: 50 })]);
  });

  it('ignores a short signal when shorts are off', async () => {
    const h = harness({ rows: makeRows({ lastIbs: 0.95 }) });
    await h.run(undefined, { ...DEPLOYMENT, enableShorts: false });
    expect(h.placed).toHaveLength(0);
    expect(h.log().why).toMatch(/shorts disabled/);
  });

  it('does nothing on stale data', async () => {
    const h = harness({ rows: makeRows({ lastIbs: 0.1, lastClose: BOUNDARY - BAR }) });
    const r = await h.run();
    expect(r.reason).toMatch(/stale data/);
    expect(h.placed).toHaveLength(0);
    expect(h.saved).toHaveLength(0);
    expect(h.log().StaleData).toBe(1);
  });

  it('does nothing when invoked too long after the bar closed', async () => {
    const h = harness({ rows: makeRows({ lastIbs: 0.1 }), startAt: BOUNDARY + 3 * 60_000 });
    const r = await h.run();
    expect(r.reason).toMatch(/too late/);
    expect(h.placed).toHaveLength(0);
  });

  it('does nothing without enough bars for warm indicators', async () => {
    const h = harness({ rows: makeRows({ lastIbs: 0.1, count: 100 }) });
    const r = await h.run();
    expect(r.reason).toMatch(/only 100 completed bars/);
  });

  it('dry run: logs what it would place, places nothing, saves nothing, publishes no metrics', async () => {
    const h = harness({ rows: makeRows({ lastIbs: 0.1 }) });
    const r = await h.run({ dryRun: true });
    expect(r.dryRun).toBe(true);
    expect(h.placed).toHaveLength(0);
    expect(h.saved).toHaveLength(0);
    const line = h.log();
    expect(line.wouldPlace).toEqual([expect.objectContaining({ side: 'buy' })]);
    expect(line._aws).toBeUndefined();
  });

  it('outside regular hours: logs the order instead of placing it, but saves state', async () => {
    const h = harness({ rows: makeRows({ lastIbs: 0.1 }), clockState: 'closed' });
    await h.run();
    expect(h.placed).toHaveLength(0);
    expect(h.log().wouldPlace).toHaveLength(1);
    expect(h.saved).toHaveLength(1);
  });

  it('trusts Tradier on a position mismatch and skips trading the bar', async () => {
    const h = harness({ rows: makeRows({ lastIbs: 0.1 }), positions: [{ symbol: 'QQQ', quantity: 30, cost_basis: 3000 }] });
    await h.run();
    expect(h.placed).toHaveLength(0);
    expect(h.saved[0].state.position).toMatchObject({ side: 'long', shares: 30, entryPrice: 100 });
    expect(h.log().ReconciliationMismatch).toBe(1);
    expect(h.log().level).toBe('warn');
  });

  it('waits on an order that is still open, and blocks trading', async () => {
    const h = harness({
      rows: makeRows({ lastIbs: 0.1 }),
      orders: [{ id: '77', symbol: 'QQQ', status: 'open' }],
      orderLookup: { '77': { id: '77', status: 'open' } },
      state: { allocationBase: 100_000, pendingOrder: { id: '77', kind: 'entry', side: 'long', orderSide: 'buy', quantity: 10, barTime: 0, placedAt: 0, reason: '' } },
    });
    await h.run();
    expect(h.placed).toHaveLength(0);
    expect(h.log().why).toMatch(/still pending/);
  });

  it('clears a rejected order and trades the bar from flat', async () => {
    const h = harness({
      rows: makeRows({ lastIbs: 0.1 }),
      orderLookup: { '77': { id: '77', status: 'rejected', exec_quantity: 0, reason_description: 'no buying power' } },
      state: { allocationBase: 100_000, pendingOrder: { id: '77', kind: 'entry', side: 'long', orderSide: 'buy', quantity: 10, barTime: 0, placedAt: 0, reason: '' } },
    });
    await h.run();
    expect(h.placed).toHaveLength(1);
    expect(h.log().notes).toEqual(expect.arrayContaining([expect.stringMatching(/rejected: no buying power/)]));
  });

  it('trips the drawdown limit: closes the position and pauses entries', async () => {
    // Allocation 10,000, 100 shares bought at 125, close ~99.8: equity ~7,480, under the 75% floor.
    const h = harness({
      rows: makeRows({ lastIbs: 0.4 }),
      positions: [{ symbol: 'QQQ', quantity: 100, cost_basis: 12_500 }],
      state: { allocationBase: 10_000, peakEquity: 10_000, position: { side: 'long', shares: 100, entryPrice: 125, entryTime: 0, exitOrderId: null, realizedPnl: 0 } },
    });
    await h.run();
    expect(h.placed).toEqual([expect.objectContaining({ side: 'sell', quantity: 100 })]);
    const s = h.saved[0].state;
    expect(s.drawdownTripBarTime).toBe(lastBarTime);
    expect(s.position).toBeNull();

    // The next bar's entry signal is held back by the pause.
    const next = harness({
      rows: makeRows({ lastIbs: 0.1, lastClose: BOUNDARY + BAR }),
      startAt: BOUNDARY + BAR + 6_000,
      state: s,
    });
    await next.run();
    expect(next.placed).toHaveLength(0);
    expect(next.log().why).toMatch(/drawdown pause, 1\/20 bars/);
  });

  it('stops new entries once the day has lost the daily limit', async () => {
    const h = harness({
      rows: makeRows({ lastIbs: 0.1 }),
      state: { allocationBase: 100_000, realizedPnlTotal: -2_500, realizedPnlToday: -2_500, tradingDay: '2026-11-09', dayStartEquity: 100_000 },
    });
    await h.run();
    expect(h.placed).toHaveLength(0);
    expect(h.log().why).toMatch(/daily loss -2500.00 reached 2%/);
  });

  it('logs an error line with Errors=1 and rethrows when Tradier fails', async () => {
    const h = harness({ rows: makeRows({ lastIbs: 0.1 }) });
    h.api.balances = async () => {
      throw Object.assign(new Error('Tradier 400'), { status: 400 });
    };
    await expect(h.run()).rejects.toThrow('Tradier 400');
    expect(h.log().level).toBe('error');
    expect(h.log().Errors).toBe(1);
  });
});

describe('evaluateLatest', () => {
  it('on a dry run, evaluates a stale bar and logs what it would do', async () => {
    const h = harness({ rows: makeRows({ lastIbs: 0.1, lastClose: BOUNDARY - 4 * BAR }), clockState: 'closed' });
    const r = await h.run({ dryRun: true, evaluateLatest: true });
    expect(r.action).toBe('entry long');
    expect(h.placed).toHaveLength(0);
    expect(h.saved).toHaveLength(0);
    expect(h.log().evaluateLatest).toBe(true);
    expect(h.log().wouldPlace).toEqual([expect.objectContaining({ side: 'buy' })]);
  });

  it('is ignored without dryRun, so a real run never trades stale data', async () => {
    const h = harness({ rows: makeRows({ lastIbs: 0.1, lastClose: BOUNDARY - 4 * BAR }) });
    const r = await h.run({ evaluateLatest: true });
    expect(r.reason).toMatch(/stale data/);
    expect(h.placed).toHaveLength(0);
  });
});

describe('30-minute deployments', () => {
  const D30 = resolveDeployment({ strategyId: 'ibs-mean-reversion', symbol: 'AVGO', interval: '30min', params: { entryIbs: 40, exitIbs: 80 }, enableShorts: true, allocationPct: 24, minBars: 100 });

  it('fetch 15-minute timesales and trade the aggregated 30-minute bar', async () => {
    // 15-minute rows ending at 10:00 ET; the last 30-minute bar (09:30-10:00) closes near its low.
    const rows = makeRows({ lastIbs: 0.5 });
    rows[rows.length - 2] = { ...rows[rows.length - 2], high: 101, low: 99, close: 99.6 };
    rows[rows.length - 1] = { ...rows[rows.length - 1], high: 100, low: 99, close: 99.2 };
    const h = harness({ rows });
    let askedFor = '';
    const ts = h.api.timesales;
    h.api.timesales = async (q) => {
      askedFor = q.interval;
      return ts(q);
    };
    const r = await h.run(undefined, D30);
    expect(askedFor).toBe('15min');
    expect(h.log().bar).toMatchObject({ time: new Date(BOUNDARY - 2 * BAR).toISOString(), high: 101, low: 99, close: 99.2 });
    // IBS (99.2 - 99) / 2 = 0.1 < 0.4: buy.
    expect(r.action).toBe('entry long');
    expect(h.saved[0].barTime).toBe(BOUNDARY - 2 * BAR);
  });
});
