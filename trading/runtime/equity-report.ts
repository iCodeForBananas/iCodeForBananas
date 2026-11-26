// Publishes to Supabase for the public /trading-leaderboard page: each
// processed bar's equity (supabase/migrations/20261108000000_trading_equity.sql) and
// each fill (20261117000000_trading_fills.sql). Global fetch only. Best effort: the
// caller logs a failure and trades on.

export interface EquitySnapshot {
  deploymentId: string;
  /** Close of the bar the equity is marked to, epoch ms. */
  barTime: number;
  strategyId: string;
  symbol: string;
  interval: string;
  equity: number;
  realizedPnl: number;
  unrealizedPnl: number;
  /** Positive long, negative short, zero flat. */
  positionShares: number;
  tradesClosed: number;
  winningTrades: number;
}

/** One order's fill and the deployment's state right after it; a row of public.trading_fills. */
export interface FillRecord {
  deploymentId: string;
  orderId: string;
  strategyId: string;
  symbol: string;
  interval: string;
  action: 'open' | 'close';
  positionSide: 'long' | 'short';
  orderSide: string;
  shares: number;
  fillPrice: number;
  /** Epoch ms. */
  fillTime: number;
  /** Epoch ms, or null when unknown. */
  placedAt: number | null;
  reason: string | null;
  /** Close only. */
  entryPrice: number | null;
  /** Close only: this fill's P&L. */
  realizedPnl: number | null;
  /** Close only, when it ends the position: the whole trade's P&L. */
  tradePnl: number | null;
  /** Signed: positive long, negative short, zero flat. */
  positionSharesAfter: number;
  realizedPnlTotal: number;
  /** Starting equity + realized + open P&L marked at the fill price. */
  equityAfter: number;
  tradesClosed: number;
  winningTrades: number;
  /** Factor putting pre-rebase dollar P&L on the deployment's starting equity; 1 for anything live. */
  pnlScale: number;
  source: 'live' | 'backfill';
}

export interface EquityReporter {
  report(snapshot: EquitySnapshot): Promise<void>;
  /** Appends a fill; a second report of the same order is ignored by the database. */
  reportFill(fill: FillRecord): Promise<void>;
}

export interface EquityReporterConfig {
  url: string;
  publishableKey: string;
  token: string;
}

/** A dashboard write never holds a trading run up for longer than this. */
export const REPORT_TIMEOUT_MS = 4_000;

const iso = (ms: number | null) => (ms == null ? null : new Date(ms).toISOString());

/** The RPC arguments for a fill, without the token. Shared with the backfill script. */
export function fillRpcArgs(f: FillRecord): Record<string, unknown> {
  return {
    p_deployment_id: f.deploymentId,
    p_order_id: f.orderId,
    p_strategy_id: f.strategyId,
    p_symbol: f.symbol,
    p_bar_interval: f.interval,
    p_action: f.action,
    p_position_side: f.positionSide,
    p_order_side: f.orderSide,
    p_shares: f.shares,
    p_fill_price: f.fillPrice,
    p_fill_time: iso(f.fillTime),
    p_placed_at: iso(f.placedAt),
    p_reason: f.reason,
    p_entry_price: f.entryPrice,
    p_realized_pnl: f.realizedPnl,
    p_trade_pnl: f.tradePnl,
    p_position_shares_after: f.positionSharesAfter,
    p_realized_pnl_total: f.realizedPnlTotal,
    p_equity_after: f.equityAfter,
    p_trades_closed: f.tradesClosed,
    p_winning_trades: f.winningTrades,
    p_pnl_scale: f.pnlScale,
    p_source: f.source,
  };
}

/**
 * @param loadConfig reads the secret. Cached until Supabase rejects the token,
 * so a rotated secret is picked up on the next run.
 */
export function createEquityReporter(loadConfig: () => Promise<EquityReporterConfig>, fetchImpl: typeof fetch = fetch): EquityReporter {
  let cached: EquityReporterConfig | null = null;

  async function rpc(fn: string, args: Record<string, unknown>): Promise<void> {
    const { url, publishableKey, token } = (cached ??= await loadConfig());
    const res = await fetchImpl(`${url.replace(/\/+$/, '')}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      // Only apikey: a publishable key is not a JWT, so it can't be a Bearer token.
      headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: token, ...args }),
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) cached = null;
      throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
  }

  async function withTimeout(work: Promise<void>): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`equity report timed out after ${REPORT_TIMEOUT_MS}ms`)), REPORT_TIMEOUT_MS);
    });
    try {
      await Promise.race([work, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    report: (s) =>
      withTimeout(
        rpc('report_trading_equity', {
          p_deployment_id: s.deploymentId,
          p_bar_time: new Date(s.barTime).toISOString(),
          p_strategy_id: s.strategyId,
          p_symbol: s.symbol,
          p_bar_interval: s.interval,
          p_equity: s.equity,
          p_realized_pnl: s.realizedPnl,
          p_unrealized_pnl: s.unrealizedPnl,
          p_position_shares: s.positionShares,
          p_trades_closed: s.tradesClosed,
          p_winning_trades: s.winningTrades,
        }),
      ),
    reportFill: (f) => withTimeout(rpc('report_trading_fill', fillRpcArgs(f))),
  };
}
