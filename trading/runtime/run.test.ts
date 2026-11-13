import { describe, expect, it } from 'vitest';
import { AVAILABLE_STRATEGIES } from '@/app/strategies';
import { DATA_DELAY_MS, resolveDeployment, type ResolvedDeployment } from './config';
import type { EquityReporter, EquitySnapshot } from './equity-report';
import { expectedBarClose, rebase, runDeployment, type DeploymentState, type RunDeps, type RunEvent } from './run';
import { etParts, etWallToUtcMs } from './time';
import type { HistoryRow, TradierApi, TradierOrder, TradierPosition, TimesalesRow } from './tradier';

const BAR = 15 * 60_000;
// Monday 2026-11-09 10:00 ET, a regular-session bar close. With the sandbox's
// 15-minute data delay, the run that acts on it fires at 10:15 ET.
const BOUNDARY = etWallToUtcMs(2026, 11, 9, 10, 0);
const AVAILABLE = BOUNDARY + DATA_DELAY_MS;

const DEPLOYMENT = resolveDeployment({
  id: 'ibs-qqq-test',
  strategyId: 'ibs-mean-reversion',
  symbol: 'QQQ',
  interval: '15min',
  params: { entryIbs: 20, exitIbs: 50, trendFilter: false },
  enableShorts: true,
  startingEquity: 100_000,
});

const etIso = (ms: number) => {
  const p = etParts(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:00`;
};

/** Whether a 15-minute bar opening at `t` is in the weekday regular session, 09:30-16:00 ET. */
function inSession(t: number): boolean {
  const p = etParts(t);
  const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  const min = p.hour * 60 + p.minute;
  return weekday !== 0 && weekday !== 6 && min >= 9 * 60 + 30 && min < 16 * 60;
}

/**
 * `count` regular-session 15-minute bars ending with the one that closes at
 * `lastClose`, its IBS set by `lastIbs`, as timesales would return them.
 */
function makeRows({ lastIbs, lastClose = BOUNDARY, count = 400, price = 100 }: { lastIbs: number; lastClose?: number; count?: number; price?: number }): TimesalesRow[] {
  const times: number[] = [];
  for (let t = lastClose - BAR; times.length < count; t -= BAR) if (inSession(t)) times.unshift(t);
  return times.map((t, k) => {
    const i = count - k;
    const last = i === 1;
    const low = price - 1;
    const high = price + 1;
    const close = last ? low + lastIbs * (high - low) : price + Math.sin(i) * 0.5;
    return { time: etIso(t), open: price, high, low, close, volume: 1000 };
  });
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
  history?: HistoryRow[];
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
      const last = o.rows[o.rows.length - 1] ?? o.history?.[o.history.length - 1];
      orders.set(id, { id, status, exec_quantity: status === 'filled' ? p.quantity : 0, avg_fill_price: o.fillPrice ?? Number(last.close) });
      return id;
    },
    async cancelOrder(id) {
      cancelled.push(id);
    },
    timesales: async () => o.rows,
    history: async () => o.history ?? [],
  };
  return { api, placed, cancelled };
}

function harness(opts: FakeOpts & { state?: Partial<DeploymentState>; startAt?: number }) {
  const tradier = fakeTradier(opts);
  let clock = opts.startAt ?? AVAILABLE + 6_000;
  const saved: { state: DeploymentState; barTime: number }[] = [];
  const lines: Record<string, unknown>[] = [];
  const deps: Omit<RunDeps, 'strategy'> = {
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
  const run = (event?: RunEvent, d: ResolvedDeployment = DEPLOYMENT) => runDeployment(d, event, { ...deps, strategy: AVAILABLE_STRATEGIES[d.strategyId] });
  return { run, deps, ...tradier, saved, lines, log: () => lines[lines.length - 1] };
}

const lastBarTime = BOUNDARY - BAR;
const metricNames = (line: Record<string, unknown>) =>
  ((line._aws as { CloudWatchMetrics: { Metrics: { Name: string }[] }[] } | undefined)?.CloudWatchMetrics[0].Metrics ?? []).map((m) => m.Name);

describe('runDeployment', () => {
  it('enters long on a low IBS close, sized to its starting equity, and records the fill', async () => {
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

  it('does nothing when invoked too long after the bar became available', async () => {
    const h = harness({ rows: makeRows({ lastIbs: 0.1 }), startAt: AVAILABLE + 3 * 60_000 });
    const r = await h.run();
    expect(r.reason).toMatch(/no bar became available just now/);
    expect(h.placed).toHaveLength(0);
    // A schedule's off-bar runs land here; that isn't stale data.
    expect(h.log().StaleData).toBeUndefined();
  });

  it('acts on the bar that closed 15 minutes ago and ignores the newer, possibly partial one', async () => {
    const rows = makeRows({ lastIbs: 0.1 });
    // The feed already shows part of the 10:00-10:15 bar, closing at its high.
    rows.push({ time: etIso(BOUNDARY), open: 100, high: 101, low: 99, close: 101, volume: 10 });
    const h = harness({ rows });
    const r = await h.run();
    expect(r.action).toBe('entry long');
    expect(h.log().bar).toMatchObject({ time: new Date(lastBarTime).toISOString() });
    expect(h.log().dataDelayMinutes).toBe(15);
  });

  it('treats the bar as stale when run at its close, before the delayed feed has it', async () => {
    // At 10:00 the expected bar is the one that closed at 09:45.
    const h = harness({ rows: makeRows({ lastIbs: 0.1, lastClose: BOUNDARY - 2 * BAR }), startAt: BOUNDARY + 6_000 });
    const r = await h.run();
    expect(r.reason).toMatch(/stale data/);
  });

  it("refuses to run when the bundled strategy is not the deployment's", async () => {
    const h = harness({ rows: makeRows({ lastIbs: 0.1 }) });
    const wrong = { ...DEPLOYMENT, strategyId: 'ema-crossover' };
    await expect(runDeployment(wrong, undefined, { ...h.deps, strategy: AVAILABLE_STRATEGIES['ibs-mean-reversion'] })).rejects.toThrow(/does not match/);
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
    // Starting equity 10,000, 100 shares bought at 125, close ~99.8: equity ~7,480, under the 75% floor.
    const D10K = { ...DEPLOYMENT, startingEquity: 10_000 };
    const h = harness({
      rows: makeRows({ lastIbs: 0.4 }),
      positions: [{ symbol: 'QQQ', quantity: 100, cost_basis: 12_500 }],
      state: { allocationBase: 10_000, peakEquity: 10_000, position: { side: 'long', shares: 100, entryPrice: 125, entryTime: 0, exitOrderId: null, realizedPnl: 0 } },
    });
    await h.run(undefined, D10K);
    expect(h.placed).toEqual([expect.objectContaining({ side: 'sell', quantity: 100 })]);
    const s = h.saved[0].state;
    expect(s.drawdownTripBarTime).toBe(lastBarTime);
    expect(s.position).toBeNull();

    // The next bar's entry signal is held back by the pause.
    const next = harness({
      rows: makeRows({ lastIbs: 0.1, lastClose: BOUNDARY + BAR }),
      startAt: AVAILABLE + BAR + 6_000,
      state: s,
    });
    await next.run(undefined, D10K);
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

  it('trades its own starting equity whatever the account holds', async () => {
    const h = harness({ rows: makeRows({ lastIbs: 0.1 }), equity: 250_000 });
    await h.run(undefined, { ...DEPLOYMENT, startingEquity: 10_000 });
    const close = 99 + 0.1 * 2;
    expect(h.placed[0]).toMatchObject({ side: 'buy', quantity: Math.floor(10_000 / close) });
    expect(h.saved[0].state.allocationBase).toBe(10_000);
    expect(h.log().StrategyEquity).toBeCloseTo(10_000, 0);
  });

  it('rebases a deployment that started on a share of the account, keeping its percent return', () => {
    const notes: string[] = [];
    const state = {
      allocationBase: 24_000, realizedPnlTotal: 480, realizedPnlToday: -240, dayStartEquity: 24_240, peakEquity: 25_200,
      position: { side: 'long', shares: 10, entryPrice: 100, entryTime: 0, exitOrderId: null, realizedPnl: 24 },
    } as DeploymentState;
    rebase(state, 10_000, notes);
    expect(state.allocationBase).toBe(10_000);
    expect(state.realizedPnlTotal).toBeCloseTo(200);
    expect(state.realizedPnlToday).toBeCloseTo(-100);
    expect(state.dayStartEquity).toBeCloseTo(10_100);
    expect(state.peakEquity).toBeCloseTo(10_500);
    expect(state.position).toMatchObject({ shares: 10, realizedPnl: 10 });
    expect(notes[0]).toMatch(/rebased from 24000.00 to 10000/);
    // Already on it: nothing changes.
    rebase(state, 10_000, notes);
    expect(state.realizedPnlTotal).toBeCloseTo(200);
    expect(notes).toHaveLength(1);
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

describe('equity reporting', () => {
  const reporter = (impl: () => Promise<void> = async () => {}) => {
    const reports: EquitySnapshot[] = [];
    return { reports, equityReporter: { report: async (s: EquitySnapshot) => { reports.push(s); await impl(); } } };
  };
  const runWith = (h: ReturnType<typeof harness>, equityReporter: EquityReporter, event?: RunEvent) =>
    runDeployment(DEPLOYMENT, event, { ...h.deps, equityReporter, strategy: AVAILABLE_STRATEGIES[DEPLOYMENT.strategyId] });

  it('reports equity marked to the bar close, after the state is saved', async () => {
    const h = harness({ rows: makeRows({ lastIbs: 0.5 }) });
    const r = reporter(async () => {
      expect(h.saved).toHaveLength(1);
    });
    await runWith(h, r.equityReporter);
    expect(r.reports).toEqual([
      {
        deploymentId: DEPLOYMENT.id,
        barTime: BOUNDARY,
        strategyId: 'ibs-mean-reversion',
        symbol: 'QQQ',
        interval: '15min',
        equity: 100_000,
        realizedPnl: 0,
        unrealizedPnl: 0,
        positionShares: 0,
        tradesClosed: 0,
        winningTrades: 0,
      },
    ]);
    expect(h.log().equityReported).toBe(true);
  });

  it('carries on when the report fails, and logs why', async () => {
    const h = harness({ rows: makeRows({ lastIbs: 0.5 }) });
    const result = await runWith(h, reporter(async () => { throw new Error('Supabase 500'); }).equityReporter);
    expect(result.ok).toBe(true);
    expect(h.saved).toHaveLength(1);
    expect(h.log().equityReported).toBe(false);
    expect(h.log().equityReportError).toBe('Supabase 500');
    expect(h.log().Errors).toBeUndefined();
  });

  it('does not report a dry run', async () => {
    const h = harness({ rows: makeRows({ lastIbs: 0.5 }) });
    const r = reporter();
    await runWith(h, r.equityReporter, { dryRun: true });
    expect(r.reports).toEqual([]);
  });

  it('does not report a bar it skipped', async () => {
    const h = harness({ rows: makeRows({ lastIbs: 0.5, lastClose: BOUNDARY - BAR }) });
    const r = reporter();
    await runWith(h, r.equityReporter);
    expect(r.reports).toEqual([]);
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
  const D30 = resolveDeployment({ strategyId: 'ibs-mean-reversion', symbol: 'AVGO', interval: '30min', params: { entryIbs: 40, exitIbs: 80 }, enableShorts: true, startingEquity: 100_000, minBars: 100 });

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

describe('regular-session intraday bars', () => {
  const t = (h: number, m: number, day = 9) => etWallToUtcMs(2026, 11, day, h, m);
  const D1H = resolveDeployment({ strategyId: 'ibs-mean-reversion', symbol: 'AVGO', interval: '1h', params: { entryIbs: 35, exitIbs: 75 }, enableShorts: true, startingEquity: 100_000, minBars: 50 });

  it('expects bars counted from 09:30, and none before the first closes or at the weekend', () => {
    expect(expectedBarClose('1h', t(10, 0))).toBeNull();
    expect(expectedBarClose('1h', t(10, 30))).toBe(t(10, 30));
    expect(expectedBarClose('1h', t(15, 59))).toBe(t(15, 30));
    // The session's last hourly bar is 15:30-16:00.
    expect(expectedBarClose('1h', t(16, 0))).toBe(t(16, 0));
    expect(expectedBarClose('1h', t(18, 0))).toBe(t(16, 0));
    expect(expectedBarClose('15min', t(9, 44))).toBeNull();
    expect(expectedBarClose('15min', t(9, 45))).toBe(t(9, 45));
    expect(expectedBarClose('30min', t(12, 10))).toBe(t(12, 0));
    // Sunday.
    expect(expectedBarClose('15min', t(12, 0, 8))).toBeNull();
  });

  it('skips a run before the day has a bar, without fetching or counting it stale', async () => {
    const h = harness({ rows: makeRows({ lastIbs: 0.1 }), startAt: t(9, 50) });
    let fetched = false;
    h.api.timesales = async () => {
      fetched = true;
      return [];
    };
    const r = await h.run();
    expect(r.reason).toMatch(/outside the regular session/);
    expect(fetched).toBe(false);
    expect(h.log().StaleData).toBeUndefined();
  });

  it("evaluates the session's short 15:30-16:00 hourly bar, and logs its order after the close", async () => {
    // 15-minute bars through 15:45; the 15:30-16:00 hourly bar closes near its low.
    const rows = makeRows({ lastIbs: 0.5, lastClose: t(16, 0) });
    rows[rows.length - 2] = { ...rows[rows.length - 2], high: 101, low: 99, close: 99.6 };
    rows[rows.length - 1] = { ...rows[rows.length - 1], high: 100, low: 99, close: 99.2 };
    const h = harness({ rows, clockState: 'postmarket', startAt: t(16, 15) + 6_000 });
    const r = await h.run(undefined, D1H);
    expect(h.log().bar).toMatchObject({ time: new Date(t(15, 30)).toISOString(), closeTime: new Date(t(16, 0)).toISOString(), low: 99, close: 99.2 });
    // IBS (99.2 - 99) / 2 = 0.1 < 0.35: buy, but the market is closed.
    expect(r.action).toBe('entry long');
    expect(h.placed).toHaveLength(0);
    expect(h.log().wouldPlace).toEqual([expect.objectContaining({ side: 'buy' })]);
  });

  it('builds hourly bars from 09:30 and ignores extended-hours bars', async () => {
    // Regular-session bars to 11:30, plus pre-market and after-hours noise.
    const rows = makeRows({ lastIbs: 0.5, lastClose: t(11, 30), count: 300 });
    rows.push({ time: '2026-11-09T07:00:00', open: 50, high: 500, low: 1, close: 2, volume: 1 });
    rows.push({ time: '2026-11-06T18:00:00', open: 50, high: 500, low: 1, close: 2, volume: 1 });
    rows.sort((a, b) => String(a.time).localeCompare(String(b.time)));
    const h = harness({ rows, startAt: t(11, 45) + 6_000 });
    await h.run(undefined, D1H);
    const line = h.log();
    expect(line.bar).toMatchObject({ time: new Date(t(10, 30)).toISOString(), closeTime: new Date(t(11, 30)).toISOString(), high: 101, low: 99 });
    expect((line.data as { droppedOutsideSession: number }).droppedOutsideSession).toBe(2);
  });
});

describe('daily deployments', () => {
  const DD = resolveDeployment({ strategyId: 'ibs-mean-reversion', symbol: 'META', interval: '1d', params: { entryIbs: 35, exitIbs: 65 }, startingEquity: 100_000, minBars: 300, historyDays: 500 });
  const pad = (n: number) => String(n).padStart(2, '0');
  /** Weekday sessions ending on `last` (YYYY, M, D), the last one closing near its low. */
  function days(count: number, last: [number, number, number], lastIbs: number): HistoryRow[] {
    const out: HistoryRow[] = [];
    let t = Date.UTC(last[0], last[1] - 1, last[2]);
    while (out.length < count) {
      const wd = new Date(t).getUTCDay();
      if (wd !== 0 && wd !== 6) {
        const d = new Date(t);
        const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
        const isLast = out.length === 0;
        out.unshift({ date, open: 100, high: 101, low: 99, close: isLast ? 99 + lastIbs * 2 : 100 + Math.sin(out.length) * 0.5, volume: 1e6 });
      }
      t -= 86_400_000;
    }
    return out;
  }
  // Monday 2026-11-09, 16:30 ET.
  const AT = etWallToUtcMs(2026, 11, 9, 16, 30);

  it('expects the latest weekday 16:00 ET close', () => {
    expect(expectedBarClose('1d', AT)).toBe(etWallToUtcMs(2026, 11, 9, 16, 0));
    // Before the close, the previous session (Friday).
    expect(expectedBarClose('1d', etWallToUtcMs(2026, 11, 9, 12, 0))).toBe(etWallToUtcMs(2026, 11, 6, 16, 0));
    // Sunday: Friday.
    expect(expectedBarClose('1d', etWallToUtcMs(2026, 11, 8, 18, 0))).toBe(etWallToUtcMs(2026, 11, 6, 16, 0));
  });

  it("acts on today's session after the close, placing the order for the next open", async () => {
    const h = harness({ rows: [], history: days(320, [2026, 11, 9], 0.1), clockState: 'closed', startAt: AT });
    let asked = '';
    h.api.timesales = async () => {
      asked = 'timesales';
      return [];
    };
    const r = await h.run(undefined, DD);
    expect(asked).toBe('');
    expect(r.action).toBe('entry long');
    expect(h.placed).toEqual([expect.objectContaining({ symbol: 'META', side: 'buy' })]);
    expect(h.log().orderTiming).toMatch(/next open/);
    expect(h.saved[0].barTime).toBe(etWallToUtcMs(2026, 11, 9, 9, 30));
  });

  it("drops today's bar before the close", async () => {
    const h = harness({ rows: [], history: days(320, [2026, 11, 9], 0.1), startAt: etWallToUtcMs(2026, 11, 9, 15, 0) });
    await h.run({ dryRun: true, evaluateLatest: true }, DD);
    expect(h.log().bar).toMatchObject({ time: new Date(etWallToUtcMs(2026, 11, 6, 9, 30)).toISOString() });
  });

  it('does nothing when today has no bar (a holiday)', async () => {
    const h = harness({ rows: [], history: days(320, [2026, 11, 6], 0.1), startAt: AT });
    const r = await h.run(undefined, DD);
    expect(r.reason).toMatch(/stale data/);
    expect(h.placed).toHaveLength(0);
  });
});
