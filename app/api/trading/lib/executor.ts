import { createClient } from "@supabase/supabase-js";
import { AVAILABLE_STRATEGIES, getDefaultParams } from "@/app/strategies";
import {
  calculateIndicatorsWithParams,
  deriveRequiredIndicators,
} from "@/app/lib/backtest-engine";
import { PricePoint } from "@/app/types";

// ── Supabase ───────────────────────────────────────────────────────────────
export function supabaseAnon() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}

export function supabaseService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ── Types ──────────────────────────────────────────────────────────────────
export type Bar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export interface DeployedStrategy {
  id: string;
  name: string;
  strategy_id: string;
  symbol: string;
  params: Record<string, number | boolean | string>;
  status: string;
  position_size: number;
  initial_capital: number;
  is_sandbox: boolean;
  timeframe: string;
  last_run_at: string | null;
}

// ── Tradier helpers ────────────────────────────────────────────────────────
async function tradierGet(apiKey: string, sandbox: boolean, path: string) {
  const base = sandbox ? "sandbox.tradier.com" : "api.tradier.com";
  const res = await fetch(`https://${base}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    cache: "no-store",
  });
  return res.json();
}

async function tradierPost(
  apiKey: string,
  sandbox: boolean,
  path: string,
  body: Record<string, string>
) {
  const base = sandbox ? "sandbox.tradier.com" : "api.tradier.com";
  const res = await fetch(`https://${base}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });
  return res.json();
}

export async function getHistoricalBars(
  apiKey: string,
  sandbox: boolean,
  symbol: string,
  days = 250
): Promise<Bar[]> {
  const end = new Date().toISOString().split("T")[0];
  const start = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
  const data = await tradierGet(
    apiKey,
    sandbox,
    `/v1/markets/history?symbol=${symbol}&interval=daily&start=${start}&end=${end}`
  );
  const raw = data?.history?.day;
  if (!raw) return [];
  return (Array.isArray(raw) ? raw : [raw]).map(
    (d: Record<string, number | string>) => ({
      time: new Date(String(d.date)).getTime(),
      open: Number(d.open),
      high: Number(d.high),
      low: Number(d.low),
      close: Number(d.close),
      volume: Number(d.volume ?? 0),
    })
  );
}

export async function getPosition(
  apiKey: string,
  sandbox: boolean,
  accountId: string,
  symbol: string
) {
  const data = await tradierGet(
    apiKey,
    sandbox,
    `/v1/accounts/${accountId}/positions`
  );
  const pos = data?.positions?.position;
  if (!pos) return null;
  const arr = Array.isArray(pos) ? pos : [pos];
  return (
    arr.find((p: Record<string, string | number>) => p.symbol === symbol) ?? null
  );
}

export async function placeOrder(
  apiKey: string,
  sandbox: boolean,
  accountId: string,
  symbol: string,
  side: string,
  qty: number
) {
  return tradierPost(apiKey, sandbox, `/v1/accounts/${accountId}/orders`, {
    class: "equity",
    symbol,
    side,
    quantity: String(qty),
    type: "market",
    duration: "day",
  });
}

// ── Strategy signal engine ─────────────────────────────────────────────────
// Routes through the canonical StrategyDefinition registry (app/strategies),
// the same code path the backtester uses. This keeps live execution and
// backtest results consistent and means new strategies don't need to be
// re-implemented here.
export function runStrategy(
  strategyId: string,
  params: Record<string, number | boolean | string>,
  bars: Bar[]
): "buy" | "sell" | "hold" {
  const strategy = AVAILABLE_STRATEGIES[strategyId];
  if (!strategy || bars.length < 2) return "hold";

  // Merge defaults so any missing param keys are populated (matches backtest).
  const mergedParams = { ...getDefaultParams(strategyId), ...params };

  // Build the indicator series the strategy handler expects.
  const pricePoints: PricePoint[] = bars.map((b) => ({
    time: b.time,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
  }));
  const { requiredEMAs, requiredSMAs, requiredMACDs, requiredDonchianPeriods } =
    deriveRequiredIndicators(strategyId, [mergedParams]);
  const series = calculateIndicatorsWithParams(
    pricePoints,
    requiredEMAs,
    requiredSMAs,
    requiredMACDs,
    requiredDonchianPeriods
  );

  const lastIdx = series.length - 1;
  const signal = strategy.handler({
    current: series[lastIdx],
    previous: series[lastIdx - 1] ?? null,
    index: lastIdx,
    series,
    params: mergedParams,
  });
  return signal.action;
}

// ── Scheduling helpers ─────────────────────────────────────────────────────
const TIMEFRAME_MINUTES: Record<string, number> = {
  "5m": 5,
  "15m": 15,
  "1h": 60,
  "4h": 240,
  daily: 20 * 60, // 20 hours — covers market-close daily runs
};

export function isDue(strategy: DeployedStrategy): boolean {
  if (!strategy.last_run_at) return true;
  const intervalMs =
    (TIMEFRAME_MINUTES[strategy.timeframe] ?? TIMEFRAME_MINUTES.daily) * 60 * 1000;
  return Date.now() - new Date(strategy.last_run_at).getTime() >= intervalMs;
}

export function nextRunLabel(strategy: DeployedStrategy): string {
  if (!strategy.last_run_at) return "pending first run";
  const intervalMs =
    (TIMEFRAME_MINUTES[strategy.timeframe] ?? TIMEFRAME_MINUTES.daily) * 60 * 1000;
  const next = new Date(
    new Date(strategy.last_run_at).getTime() + intervalMs
  );
  const diff = next.getTime() - Date.now();
  if (diff <= 0) return "due now";
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.round(diff / 3600000);
  return `in ${hrs}h`;
}

// ── Core executor ──────────────────────────────────────────────────────────
export async function executeStrategy(strategy: DeployedStrategy): Promise<{
  signal: string;
  tradeAction: string;
  currentPrice: number;
  error?: string;
}> {
  const apiKey = process.env.TRADIER_API_KEY;
  const accountId = process.env.TRADIER_ACCOUNT_ID;

  if (!apiKey || !accountId) {
    return {
      signal: "hold",
      tradeAction: "skipped — TRADIER_API_KEY or TRADIER_ACCOUNT_ID not set",
      currentPrice: 0,
    };
  }

  const db = supabaseService();

  const bars = await getHistoricalBars(
    apiKey,
    strategy.is_sandbox,
    strategy.symbol,
    250
  );
  if (bars.length < 30) {
    throw new Error("Not enough market data");
  }

  const signal = runStrategy(strategy.strategy_id, strategy.params, bars);
  const currentPrice = bars[bars.length - 1].close;

  const { data: openTrades } = await db
    .from("lambda_trades")
    .select("*")
    .eq("lambda_id", strategy.id)
    .eq("status", "open")
    .limit(1);
  const openTrade = openTrades?.[0] ?? null;

  const position = await getPosition(
    apiKey,
    strategy.is_sandbox,
    accountId,
    strategy.symbol
  );
  const inPosition = !!(position && Number(position.quantity) > 0);

  let tradeAction = "none";

  if (signal === "buy" && !inPosition) {
    await placeOrder(
      apiKey,
      strategy.is_sandbox,
      accountId,
      strategy.symbol,
      "buy",
      strategy.position_size
    );
    await db.from("lambda_trades").insert({
      lambda_id: strategy.id,
      symbol: strategy.symbol,
      side: "LONG",
      entry_price: currentPrice,
      quantity: strategy.position_size,
      entry_time: new Date().toISOString(),
      status: "open",
    });
    tradeAction = "opened long";
  } else if (signal === "sell" && inPosition && openTrade) {
    const qty = Number(position.quantity);
    const orderResult = await placeOrder(
      apiKey,
      strategy.is_sandbox,
      accountId,
      strategy.symbol,
      "sell",
      qty
    );
    const pnl = (currentPrice - openTrade.entry_price) * qty;
    await db
      .from("lambda_trades")
      .update({
        exit_price: currentPrice,
        exit_time: new Date().toISOString(),
        pnl,
        pnl_percent: (pnl / (openTrade.entry_price * qty)) * 100,
        status: "closed",
        exit_reason: "Strategy signal: sell",
        order_id: orderResult?.order?.id ? String(orderResult.order.id) : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", openTrade.id);
    tradeAction = "closed long";
  }

  // Update last_run_at
  await db
    .from("trading_lambdas")
    .update({ last_run_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", strategy.id);

  return { signal, tradeAction, currentPrice };
}
