import { describe, expect, it } from 'vitest';
import { calculateIndicatorsWithParams, deriveRequiredIndicators } from '@/app/lib/backtest-engine';
import { AVAILABLE_STRATEGIES } from '@/app/strategies';
import { resolveDeployment, validateDeployments, type Deployment } from './config';
import { computeSeries, parseBars } from './market';
import { emfFields } from './metrics';
import { etDate, etWallToUtcMs, isRegularSessionClose, parseEtTimestamp } from './time';
import { createTradierClient } from './tradier';
import { DEPLOYMENTS } from '../deployments';

const base: Deployment = { id: 'a', strategyId: 'ibs-mean-reversion', symbol: 'QQQ', interval: '15min', allocationPct: 50 };

describe('validateDeployments', () => {
  it('accepts the checked-in deployments', () => {
    expect(validateDeployments(DEPLOYMENTS)).toEqual([]);
  });

  it('accepts a valid list', () => {
    expect(validateDeployments([base, { ...base, id: 'b', symbol: 'SPY', strategyId: 'rsi2' }])).toEqual([]);
  });

  it('rejects unknown strategies and parameters, and wrong types', () => {
    const errors = validateDeployments([
      { ...base, strategyId: 'nope' },
      { ...base, id: 'b', symbol: 'SPY', params: { entryIbs: '20', bogus: 1 } },
    ]);
    expect(errors.join('\n')).toMatch(/unknown strategyId "nope"/);
    expect(errors.join('\n')).toMatch(/no parameter "bogus"/);
    expect(errors.join('\n')).toMatch(/"entryIbs" must be a number/);
  });

  it('rejects duplicate ids, two enabled deployments on a symbol, and over-allocation', () => {
    const errors = validateDeployments([base, { ...base }, { ...base, id: 'c', allocationPct: 60 }]).join('\n');
    expect(errors).toMatch(/duplicate id/);
    expect(errors).toMatch(/QQQ is already traded/);
    expect(errors).toMatch(/allocate 160%/);
  });

  it('lets a disabled deployment share a symbol and stay out of the allocation total', () => {
    expect(validateDeployments([base, { ...base, id: 'b', allocationPct: 90, enabled: false }])).toEqual([]);
  });

  it('rejects bad ids and intervals', () => {
    const errors = validateDeployments([{ ...base, id: 'Bad_Id', interval: '2min' as never }]).join('\n');
    expect(errors).toMatch(/id must be lowercase/);
    expect(errors).toMatch(/interval must be one of/);
  });

  it('fills in strategy defaults under the overrides', () => {
    const r = resolveDeployment({ ...base, params: { exitIbs: 50 } });
    expect(r.params).toEqual({ entryIbs: 20, exitIbs: 50, trendFilter: false });
    expect(r.maxDailyLossPct).toBe(2);
    expect(r.enabled).toBe(true);
  });
});

describe('time', () => {
  it('converts Eastern wall time across DST', () => {
    expect(new Date(parseEtTimestamp('2026-11-06T09:30:00')).toISOString()).toBe('2026-11-06T14:30:00.000Z');
    expect(new Date(parseEtTimestamp('2026-07-06T09:30:00')).toISOString()).toBe('2026-07-06T13:30:00.000Z');
    expect(parseEtTimestamp('garbage')).toBeNaN();
    expect(etDate(Date.parse('2026-11-07T03:30:00Z'))).toBe('2026-11-06');
  });

  it('knows the regular session', () => {
    expect(isRegularSessionClose(etWallToUtcMs(2026, 11, 9, 9, 45))).toBe(true);
    expect(isRegularSessionClose(etWallToUtcMs(2026, 11, 9, 16, 0))).toBe(false);
    expect(isRegularSessionClose(etWallToUtcMs(2026, 11, 9, 9, 30))).toBe(true);
    expect(isRegularSessionClose(etWallToUtcMs(2026, 11, 9, 9, 15))).toBe(false);
  });
});

describe('market', () => {
  const BAR = 15 * 60_000;
  it('drops invalid, duplicate and still-forming bars', () => {
    const t0 = etWallToUtcMs(2026, 11, 9, 9, 30);
    const now = t0 + 2 * BAR + 60_000;
    const r = parseBars(
      [
        { time: '2026-11-09T09:45:00', open: 1, high: 2, low: 0.5, close: 1.5 },
        { time: '2026-11-09T09:30:00', open: 1, high: 2, low: 0.5, close: 1 },
        { time: '2026-11-09T09:30:00', open: 1, high: 2, low: 0.5, close: 1.2 },
        { time: '2026-11-09T10:00:00', open: 1, high: 2, low: 0.5, close: 1.1 },
        { time: '2026-11-09T09:15:00', open: 1, high: 0.9, low: 0.5, close: 1 },
      ],
      BAR,
      now,
    );
    expect(r.bars.map((b) => b.time)).toEqual([t0, t0 + BAR]);
    expect(r.bars[0].close).toBe(1.2);
    expect(r.invalid).toBe(1);
    expect(r.droppedForming).toBe(1);
  });

  it('computes exactly what the backtest engine computes', () => {
    const bars = Array.from({ length: 300 }, (_, i) => {
      const c = 100 + Math.sin(i / 7) * 5 + i * 0.01;
      return { time: i * BAR, open: c - 0.2, high: c + 1, low: c - 1, close: c, volume: 1 };
    });
    for (const id of ['ibs-mean-reversion', 'macd-crossover', 'donchian-channel', 'ema-crossover']) {
      const params = resolveDeployment({ ...base, strategyId: id }).params;
      const req = deriveRequiredIndicators(id, [params]);
      const expected = calculateIndicatorsWithParams(bars, req.requiredEMAs, req.requiredSMAs, req.requiredMACDs, req.requiredDonchianPeriods);
      expect(computeSeries(bars, id, params)).toEqual(expected);
      // And every strategy runs on the series without throwing.
      const series = computeSeries(bars, id, params);
      expect(() => AVAILABLE_STRATEGIES[id].handler({ current: series[299], previous: series[298], index: 299, series, params, position: null })).not.toThrow();
    }
  });
});

describe('emfFields', () => {
  it('declares only the finite metrics, under the deployment dimension', () => {
    const f = emfFields('dep', { StrategyEquity: 10, Errors: 0, DrawdownPct: NaN, AccountEquity: null }, 1234);
    expect(f.Deployment).toBe('dep');
    expect(f.StrategyEquity).toBe(10);
    expect(f.Errors).toBe(0);
    expect(f.DrawdownPct).toBeUndefined();
    expect(f._aws).toEqual({
      Timestamp: 1234,
      CloudWatchMetrics: [
        {
          Namespace: 'TradierTrading',
          Dimensions: [['Deployment']],
          Metrics: [
            { Name: 'StrategyEquity', Unit: 'None' },
            { Name: 'Errors', Unit: 'Count' },
          ],
        },
      ],
    });
  });

  it('emits nothing when there is nothing to publish', () => {
    expect(emfFields('dep', {}, 1)).toEqual({});
  });
});

describe('tradier client', () => {
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

  it('never retries a 4xx', async () => {
    let calls = 0;
    const c = createTradierClient(async () => ({ accessToken: 't', accountId: 'VA1' }), (async () => {
      calls++;
      return new Response('bad', { status: 400 });
    }) as typeof fetch);
    await expect(c.clock()).rejects.toMatchObject({ status: 400 });
    expect(calls).toBe(1);
  });

  it('retries a 5xx up to three attempts', async () => {
    let calls = 0;
    const c = createTradierClient(async () => ({ accessToken: 't', accountId: 'VA1' }), (async () => {
      calls++;
      return calls < 3 ? new Response('down', { status: 503 }) : ok({ clock: { state: 'open' } });
    }) as typeof fetch);
    expect(await c.clock()).toEqual({ state: 'open' });
    expect(calls).toBe(3);
  }, 10_000);

  it('never retries an order placement', async () => {
    let calls = 0;
    const c = createTradierClient(async () => ({ accessToken: 't', accountId: 'VA1' }), (async () => {
      calls++;
      return new Response('down', { status: 502 });
    }) as typeof fetch);
    await expect(c.placeMarketOrder({ symbol: 'QQQ', side: 'buy', quantity: 1, tag: 'x' })).rejects.toMatchObject({ status: 502 });
    expect(calls).toBe(1);
  });

  it('re-reads the secret after a 401 and only talks to the sandbox', async () => {
    let loads = 0;
    const urls: string[] = [];
    let status = 401;
    const c = createTradierClient(async () => {
      loads++;
      return { accessToken: `t${loads}`, accountId: 'VA1' };
    }, (async (url: URL) => {
      urls.push(String(url));
      return status === 401 ? new Response('no', { status }) : ok({ clock: { state: 'closed' } });
    }) as unknown as typeof fetch);
    await expect(c.clock()).rejects.toMatchObject({ status: 401 });
    status = 200;
    await c.clock();
    expect(loads).toBe(2);
    expect(urls.every((u) => u.startsWith('https://sandbox.tradier.com/v1/'))).toBe(true);
  });
});
