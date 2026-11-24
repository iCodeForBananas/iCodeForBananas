import { describe, expect, it } from 'vitest';
import { AVAILABLE_STRATEGIES } from '@/app/strategies';
import { deploymentId, resolveDeployment, type Deployment } from './config';
import { deploymentToRow, rowToDeployment, validateAppDeployment, type AppDeploymentInput, type AppDeploymentRow } from './app-deployments';
import { dispatch, isDue, selectRunnable, type RunOutcome } from './dispatch';
import type { TradierApi } from './tradier';

// Monday 2026-11-23, EST (UTC-5).
const et = (hhmm: string, day = '2026-11-23') => Date.parse(`${day}T${hhmm}:00-05:00`);

const input = (over: Partial<AppDeploymentInput> = {}): AppDeploymentInput => ({
  strategyId: 'ibs-mean-reversion',
  symbol: 'ZZZ',
  interval: '15min',
  params: { entryIbs: 20, exitIbs: 80, trendFilter: false },
  enableShorts: false,
  startingEquity: 10_000,
  positionSizePct: 100,
  maxDailyLossPct: 100,
  drawdownLimitPct: 25,
  drawdownPauseBars: 20,
  minBars: 50,
  historyDays: 10,
  ...over,
});
const row = (over: Partial<AppDeploymentInput> = {}, extra: Partial<AppDeploymentRow> = {}): AppDeploymentRow => ({
  ...deploymentToRow(input(over)),
  enabled: true,
  created_at: '2026-11-20T00:00:00Z',
  ...extra,
});

describe('isDue', () => {
  it('runs a 15-minute deployment on the tick its bar becomes available, 15 minutes after the close', () => {
    expect(isDue('15min', et('09:55'))).toBe(false);
    expect(isDue('15min', et('10:00'))).toBe(true); // 09:30-09:45 bar
    expect(isDue('15min', et('10:05'))).toBe(false);
    expect(isDue('15min', et('10:15'))).toBe(true);
    expect(isDue('15min', et('16:15'))).toBe(true); // the 15:45-16:00 bar
    expect(isDue('15min', et('16:30'))).toBe(false);
  });

  it('runs 5-minute deployments every tick from 09:50 to 16:15', () => {
    expect(isDue('5min', et('09:45'))).toBe(false);
    expect(isDue('5min', et('09:50'))).toBe(true);
    expect(isDue('5min', et('12:35'))).toBe(true);
    expect(isDue('5min', et('16:15'))).toBe(true);
    expect(isDue('5min', et('16:20'))).toBe(false);
  });

  it('runs hourly bars counted from 09:30, and the short last one', () => {
    expect(isDue('1h', et('10:45'))).toBe(true);
    expect(isDue('1h', et('11:15'))).toBe(false);
    expect(isDue('1h', et('15:45'))).toBe(true); // 14:30-15:30
    expect(isDue('1h', et('16:15'))).toBe(true); // 15:30-16:00
  });

  it('runs daily deployments at 16:30 ET on weekdays only', () => {
    expect(isDue('1d', et('16:25'))).toBe(false);
    expect(isDue('1d', et('16:30'))).toBe(true);
    expect(isDue('1d', et('16:35'))).toBe(false);
    expect(isDue('1d', et('16:30', '2026-11-22'))).toBe(false); // Sunday
  });

  it('runs nothing at the weekend', () => {
    expect(isDue('15min', et('10:00', '2026-11-21'))).toBe(false);
  });
});

describe('app deployments', () => {
  it('round-trips a row, with the id the runtime derives', () => {
    const r = row();
    expect(r.id).toBe(deploymentId(input()));
    expect(resolveDeployment(rowToDeployment(r))).toEqual(resolveDeployment({ ...input(), id: r.id, enabled: true }));
  });

  it('refuses intervals finer than the tick, and anything validateDeployments refuses', () => {
    expect(validateAppDeployment(input({ interval: '1min' }), [])).toEqual([expect.stringContaining('interval must be one of')]);
    expect(validateAppDeployment(input({ positionSizePct: 0 }), [])).toEqual([expect.stringContaining('positionSizePct')]);
    expect(validateAppDeployment(input(), [])).toEqual([]);
  });

  it('refuses a symbol an enabled code deployment trades, or a code deployment\'s id', () => {
    const live: Deployment = { ...input({ interval: '1h', params: { entryIbs: 5, exitIbs: 50, trendFilter: false } }) };
    expect(validateAppDeployment(input(), [live]).join()).toContain('already traded by');
    expect(validateAppDeployment(input(), [{ ...live, enabled: false }])).toEqual([]);
    const code: Deployment = { ...input(), enabled: false };
    expect(validateAppDeployment(input(), [code]).join()).toContain('already deployed from trading/deployments.ts');
  });

  it('runs the oldest of two enabled deployments on one symbol and skips paused ones', () => {
    const a = row({ interval: '15min' }, { created_at: '2026-11-01T00:00:00Z' });
    const b = row({ interval: '1h' }, { created_at: '2026-11-02T00:00:00Z' });
    const c = row({ symbol: 'YYY' }, { enabled: false });
    const sel = selectRunnable([b, c, a], []);
    expect(sel.run.map((d) => d.id)).toEqual([a.id]);
    expect(sel.rejected).toEqual([{ id: b.id, errors: [expect.stringContaining('already traded by app deployment')] }]);
  });
});

describe('dispatch', () => {
  const noTradier = new Proxy({}, { get: () => () => Promise.reject(new Error('tradier down')) }) as unknown as TradierApi;
  const setup = (rows: AppDeploymentRow[], t: number) => {
    const reported: RunOutcome[] = [];
    const finished: string[] = [];
    const logs: string[] = [];
    const deps = {
      source: { list: async () => rows, reportRun: async (o: RunOutcome) => void reported.push(o), finishTeardown: async (id: string) => void finished.push(id) },
      strategies: AVAILABLE_STRATEGIES,
      codeDeployments: [],
      tradier: noTradier,
      store: { load: async () => null, save: async () => {} },
      now: () => t,
      sleep: async () => {},
      log: (l: string) => void logs.push(l),
    };
    return { deps, reported, logs, finished };
  };

  it('runs nothing between bars, and reports nothing', async () => {
    const { deps, reported } = setup([row()], et('10:05'));
    const res = await dispatch({}, deps);
    expect(res.due).toEqual([]);
    expect(reported).toEqual([]);
  });

  it('runs what is due and records each outcome, errors included', async () => {
    const r = row();
    const { deps, reported } = setup([r], et('10:00'));
    const res = await dispatch({}, deps);
    expect(res.due).toEqual([r.id]);
    expect(reported).toEqual([{ id: r.id, at: et('10:00'), action: 'error', reason: null, error: 'tradier down' }]);
  });

  it('rejects, and reports, a row whose strategy is not in the registry', async () => {
    const r = { ...row(), strategy_id: 'not-a-strategy' };
    const { deps, reported } = setup([r], et('10:00'));
    await dispatch({}, deps);
    expect(reported[0]).toMatchObject({ id: r.id, action: 'rejected' });
  });

  it('runs every enabled deployment when asked for all', async () => {
    const r = row({ interval: '1d' });
    const { deps } = setup([r, row({ symbol: 'YYY' }, { enabled: false })], et('11:07'));
    expect((await dispatch({ all: true, dryRun: true, evaluateLatest: true }, deps)).due).toEqual([r.id]);
  });

  it('runs named ids whenever asked, and a dry run writes nothing back', async () => {
    const r = row({ interval: '1d' });
    const { deps, reported } = setup([r], et('11:07'));
    const res = await dispatch({ ids: [r.id], dryRun: true, evaluateLatest: true }, deps);
    expect(res.due).toEqual([r.id]);
    expect(res.outcomes[0].error).toBe('tradier down');
    expect(reported).toEqual([]);
  });

  it('removes a deleted deployment that is already flat, on any tick', async () => {
    const r = row({}, { enabled: false, teardown_requested_at: '2026-11-23T15:00:00Z' });
    const { deps, finished, reported } = setup([r], et('10:05'));
    deps.tradier = { ...flatTradier } as TradierApi;
    const res = await dispatch({}, deps);
    expect(res.due).toEqual([]);
    expect(finished).toEqual([r.id]);
    expect(res.teardowns[0]).toMatchObject({ id: r.id, action: 'removed (flat)' });
    expect(reported).toEqual([]);
  });

  it('keeps a deleted deployment and reports the error when the teardown fails', async () => {
    const r = row({}, { enabled: false, teardown_requested_at: '2026-11-23T15:00:00Z' });
    const { deps, finished, reported } = setup([r], et('10:05'));
    await dispatch({}, deps);
    expect(finished).toEqual([]);
    expect(reported).toEqual([{ id: r.id, at: et('10:05'), action: 'teardown error', reason: null, error: 'tradier down' }]);
  });
});

const flatTradier: Partial<TradierApi> = {
  clock: async () => ({ state: 'open' }),
  positions: async () => [],
  orders: async () => [],
};
