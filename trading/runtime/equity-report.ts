// Publishes each processed bar's equity to Supabase for the public
// /trading-equity page (supabase/migrations/20261108_trading_equity.sql).
// Global fetch only. Best effort: the caller logs a failure and trades on.

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

export interface EquityReporter {
  report(snapshot: EquitySnapshot): Promise<void>;
}

export interface EquityReporterConfig {
  url: string;
  publishableKey: string;
  token: string;
}

/** A dashboard write never holds a trading run up for longer than this. */
export const REPORT_TIMEOUT_MS = 4_000;

/**
 * @param loadConfig reads the secret. Cached until Supabase rejects the token,
 * so a rotated secret is picked up on the next run.
 */
export function createEquityReporter(loadConfig: () => Promise<EquityReporterConfig>, fetchImpl: typeof fetch = fetch): EquityReporter {
  let cached: EquityReporterConfig | null = null;

  async function send(s: EquitySnapshot): Promise<void> {
    const { url, publishableKey, token } = (cached ??= await loadConfig());
    const res = await fetchImpl(`${url.replace(/\/+$/, '')}/rest/v1/rpc/report_trading_equity`, {
      method: 'POST',
      // Only apikey: a publishable key is not a JWT, so it can't be a Bearer token.
      headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_token: token,
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
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) cached = null;
      throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
  }

  return {
    async report(snapshot) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`equity report timed out after ${REPORT_TIMEOUT_MS}ms`)), REPORT_TIMEOUT_MS);
      });
      try {
        await Promise.race([send(snapshot), timeout]);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
