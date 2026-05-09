import { createClient } from "@supabase/supabase-js";

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

// ── Indicator helpers ──────────────────────────────────────────────────────
export function calcEMA(data: number[], period: number): number[] {
  const mult = 2 / (period + 1);
  const result: number[] = [];
  let ema = data[0];
  for (const v of data) {
    ema = (v - ema) * mult + ema;
    result.push(ema);
  }
  return result;
}

export function calcSMA(data: number[], period: number): (number | null)[] {
  return data.map((_, i) =>
    i < period - 1
      ? null
      : data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period
  );
}

export function calcRSI(closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = [];
  let ag = 0,
    al = 0;
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      result.push(null);
      continue;
    }
    const d = closes[i] - closes[i - 1],
      g = d > 0 ? d : 0,
      l = d < 0 ? -d : 0;
    if (i < period) {
      ag += g;
      al += l;
      result.push(null);
    } else if (i === period) {
      ag = (ag + g) / period;
      al = (al + l) / period;
      result.push(al === 0 ? 100 : 100 - 100 / (1 + ag / al));
    } else {
      ag = (ag * (period - 1) + g) / period;
      al = (al * (period - 1) + l) / period;
      result.push(al === 0 ? 100 : 100 - 100 / (1 + ag / al));
    }
  }
  return result;
}

// ── Strategy signal engine ─────────────────────────────────────────────────
export function runStrategy(
  strategyId: string,
  params: Record<string, number | boolean | string>,
  bars: Bar[]
): "buy" | "sell" | "hold" {
  const closes = bars.map((b) => b.close);
  const n = bars.length;

  switch (strategyId) {
    case "ema-crossover":
    case "triple-ema": {
      const fp = Number(params.fastPeriod ?? 9),
        sp = Number(params.slowPeriod ?? 21);
      const mp = Number(params.midPeriod ?? 0);
      const fast = calcEMA(closes, fp),
        slow = calcEMA(closes, sp);
      if (mp) {
        const mid = calcEMA(closes, mp);
        const bullNow =
          fast[n - 1] > mid[n - 1] && mid[n - 1] > slow[n - 1];
        const bullPrev =
          fast[n - 2] > mid[n - 2] && mid[n - 2] > slow[n - 2];
        const bearNow =
          fast[n - 1] < mid[n - 1] && mid[n - 1] < slow[n - 1];
        const bearPrev =
          fast[n - 2] < mid[n - 2] && mid[n - 2] < slow[n - 2];
        if (bullNow && !bullPrev) return "buy";
        if (bearNow && !bearPrev) return "sell";
        return "hold";
      }
      if (fast[n - 2] <= slow[n - 2] && fast[n - 1] > slow[n - 1])
        return "buy";
      if (fast[n - 2] >= slow[n - 2] && fast[n - 1] < slow[n - 1])
        return "sell";
      return "hold";
    }
    case "sma-crossover": {
      const fp = Number(params.fastPeriod ?? 50),
        sp = Number(params.slowPeriod ?? 200);
      const fast = calcSMA(closes, fp),
        slow = calcSMA(closes, sp);
      const cf = fast[n - 1],
        cs = slow[n - 1],
        pf = fast[n - 2],
        ps = slow[n - 2];
      if (!cf || !cs || !pf || !ps) return "hold";
      if (pf <= ps && cf > cs) return "buy";
      if (pf >= ps && cf < cs) return "sell";
      return "hold";
    }
    case "rsi-mean-reversion":
    case "rsi2": {
      const period = strategyId === "rsi2" ? 2 : 14;
      const os = Number(
        params.oversold ?? (strategyId === "rsi2" ? 10 : 30)
      );
      const ob = Number(
        params.overbought ?? (strategyId === "rsi2" ? 90 : 70)
      );
      const rsi = calcRSI(closes, period);
      const r = rsi[n - 1];
      if (r == null) return "hold";
      if (r < os) return "buy";
      if (r > ob) return "sell";
      return "hold";
    }
    case "macd-crossover": {
      const fp = Number(params.fastPeriod ?? 12),
        sp2 = Number(params.slowPeriod ?? 26),
        sig = Number(params.signalPeriod ?? 9);
      const fast = calcEMA(closes, fp),
        slow2 = calcEMA(closes, sp2);
      const macd = fast.map((v, i) => v - slow2[i]);
      const signal = calcEMA(macd, sig);
      if (macd[n - 2] <= signal[n - 2] && macd[n - 1] > signal[n - 1])
        return "buy";
      if (macd[n - 2] >= signal[n - 2] && macd[n - 1] < signal[n - 1])
        return "sell";
      return "hold";
    }
    case "bollinger-bands": {
      const period = Number(params.period ?? 20),
        mult = Number(params.stdDev ?? 2);
      const sma = calcSMA(closes, period);
      const band = (side: 1 | -1) =>
        closes.map((_, i) => {
          if (i < period - 1) return null;
          const sl = closes.slice(i - period + 1, i + 1);
          const m = sma[i]!;
          const std = Math.sqrt(
            sl.reduce((s, v) => s + (v - m) ** 2, 0) / period
          );
          return m + side * mult * std;
        });
      const upper = band(1),
        lower = band(-1);
      const cu = upper[n - 1],
        cl = lower[n - 1],
        pu = upper[n - 2],
        pl = lower[n - 2];
      if (!cu || !cl || !pu || !pl) return "hold";
      if (closes[n - 2] > pl && closes[n - 1] < cl) return "buy";
      if (closes[n - 2] < pu && closes[n - 1] > cu) return "sell";
      return "hold";
    }
    default:
      return "hold";
  }
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
