import { describe, expect, it, vi } from 'vitest';
import { createEquityReporter, REPORT_TIMEOUT_MS, type EquitySnapshot, type FillRecord } from './equity-report';

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

const FILL: FillRecord = {
  deploymentId: 'ibs-qqq',
  orderId: '41780107',
  strategyId: 'ibs-mean-reversion',
  symbol: 'QQQ',
  interval: '15min',
  action: 'close',
  positionSide: 'short',
  orderSide: 'buy_to_cover',
  shares: 16,
  fillPrice: 620,
  fillTime: Date.UTC(2026, 10, 17, 14, 30, 5),
  placedAt: null,
  reason: 'IBS 0.30 < 0.35',
  entryPrice: 640,
  realizedPnl: 320,
  tradePnl: 320,
  positionSharesAfter: 0,
  realizedPnlTotal: 738.1,
  equityAfter: 10_738.1,
  tradesClosed: 2,
  winningTrades: 2,
  pnlScale: 1,
  source: 'live',
};

describe('reportFill', () => {
  it('posts the fill to report_trading_fill with every column', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    await createEquityReporter(async () => CONFIG, fetchImpl as unknown as typeof fetch).reportFill(FILL);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://x.supabase.co/rest/v1/rpc/report_trading_fill');
    expect(JSON.parse(String(init.body))).toEqual({
      p_token: 'secret-token',
      p_deployment_id: 'ibs-qqq',
      p_order_id: '41780107',
      p_strategy_id: 'ibs-mean-reversion',
      p_symbol: 'QQQ',
      p_bar_interval: '15min',
      p_action: 'close',
      p_position_side: 'short',
      p_order_side: 'buy_to_cover',
      p_shares: 16,
      p_fill_price: 620,
      p_fill_time: '2026-11-17T14:30:05.000Z',
      p_placed_at: null,
      p_reason: 'IBS 0.30 < 0.35',
      p_entry_price: 640,
      p_realized_pnl: 320,
      p_trade_pnl: 320,
      p_position_shares_after: 0,
      p_realized_pnl_total: 738.1,
      p_equity_after: 10_738.1,
      p_trades_closed: 2,
      p_winning_trades: 2,
      p_pnl_scale: 1,
      p_source: 'live',
    });
  });
});

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
