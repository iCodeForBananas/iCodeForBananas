import { describe, expect, it, vi } from 'vitest';
import { createEquityReporter, REPORT_TIMEOUT_MS, type EquitySnapshot } from './equity-report';

const SNAPSHOT: EquitySnapshot = {
  deploymentId: 'ibs-qqq',
  barTime: Date.UTC(2026, 10, 9, 15, 0),
  strategyId: 'ibs-mean-reversion',
  symbol: 'QQQ',
  interval: '15min',
  equity: 12_345.5,
  realizedPnl: 300,
  unrealizedPnl: 45.5,
  positionShares: -10,
  tradesClosed: 4,
  winningTrades: 3,
};
const CONFIG = { url: 'https://x.supabase.co/', publishableKey: 'sb_publishable_x', token: 'secret-token' };

describe('createEquityReporter', () => {
  it('posts the snapshot to the RPC with only the publishable key as credentials', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    await createEquityReporter(async () => CONFIG, fetchImpl as unknown as typeof fetch).report(SNAPSHOT);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://x.supabase.co/rest/v1/rpc/report_trading_equity');
    expect(init.headers).toEqual({ apikey: 'sb_publishable_x', 'Content-Type': 'application/json' });
    expect(JSON.parse(String(init.body))).toEqual({
      p_token: 'secret-token',
      p_deployment_id: 'ibs-qqq',
      p_bar_time: '2026-11-09T15:00:00.000Z',
      p_strategy_id: 'ibs-mean-reversion',
      p_symbol: 'QQQ',
      p_bar_interval: '15min',
      p_equity: 12_345.5,
      p_realized_pnl: 300,
      p_unrealized_pnl: 45.5,
      p_position_shares: -10,
      p_trades_closed: 4,
      p_winning_trades: 3,
    });
  });

  it('reads the secret once across runs', async () => {
    const load = vi.fn(async () => CONFIG);
    const reporter = createEquityReporter(load, (async () => new Response(null, { status: 204 })) as typeof fetch);
    await reporter.report(SNAPSHOT);
    await reporter.report(SNAPSHOT);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('throws on a rejected token and re-reads the secret next time', async () => {
    const load = vi.fn(async () => CONFIG);
    const reporter = createEquityReporter(load, (async () => new Response('invalid reporter token', { status: 401 })) as typeof fetch);
    await expect(reporter.report(SNAPSHOT)).rejects.toThrow('Supabase 401: invalid reporter token');
    await expect(reporter.report(SNAPSHOT)).rejects.toThrow();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('gives up rather than hanging the run', async () => {
    vi.useFakeTimers();
    try {
      const reporter = createEquityReporter(() => new Promise(() => {}));
      const result = expect(reporter.report(SNAPSHOT)).rejects.toThrow('timed out');
      await vi.advanceTimersByTimeAsync(REPORT_TIMEOUT_MS);
      await result;
    } finally {
      vi.useRealTimers();
    }
  });
});
