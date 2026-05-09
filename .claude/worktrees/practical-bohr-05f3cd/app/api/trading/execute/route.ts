import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
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

async function tradierPost(apiKey: string, sandbox: boolean, path: string, body: Record<string, string>) {
  const base = sandbox ? "sandbox.tradier.com" : "api.tradier.com";
  const res = await fetch(`https://${base}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  return res.json();
}

async function getHistoricalBars(apiKey: string, sandbox: boolean, symbol: string, days = 250) {
  const end = new Date().toISOString().split("T")[0];
  const start = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
  const data = await tradierGet(apiKey, sandbox, `/v1/markets/history?symbol=${symbol}&interval=daily&start=${start}&end=${end}`);
  const raw = data?.history?.day;
  if (!raw) return [];
  return (Array.isArray(raw) ? raw : [raw]).map((d: Record<string, number | string>) => ({
    time: new Date(String(d.date)).getTime(),
    open: Number(d.open), high: Number(d.high), low: Number(d.low), close: Number(d.close), volume: Number(d.volume ?? 0),
  }));
}

async function getPosition(apiKey: string, sandbox: boolean, accountId: string, symbol: string) {
  const data = await tradierGet(apiKey, sandbox, `/v1/accounts/${accountId}/positions`);
  const pos = data?.positions?.position;
  if (!pos) return null;
  const arr = Array.isArray(pos) ? pos : [pos];
  return arr.find((p: Record<string, string | number>) => p.symbol === symbol) ?? null;
}

async function placeOrder(apiKey: string, sandbox: boolean, accountId: string, symbol: string, side: string, qty: number) {
  return tradierPost(apiKey, sandbox, `/v1/accounts/${accountId}/orders`, {
    class: "equity", symbol, side, quantity: String(qty), type: "market", duration: "day",
  });
}

// ── Indicator helpers ──────────────────────────────────────────────────────
function calcEMA(data: number[], period: number): number[] {
  const mult = 2 / (period + 1);
  const result: number[] = [];
  let ema = data[0];
  for (const v of data) { ema = (v - ema) * mult + ema; result.push(ema); }
  return result;
}

function calcSMA(data: number[], period: number): (number | null)[] {
  return data.map((_, i) => i < period - 1 ? null : data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period);
}

function calcRSI(closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = [];
  let ag = 0, al = 0;
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) { result.push(null); continue; }
    const d = closes[i] - closes[i - 1], g = d > 0 ? d : 0, l = d < 0 ? -d : 0;
    if (i < period) { ag += g; al += l; result.push(null); }
    else if (i === period) { ag = (ag + g) / period; al = (al + l) / period; result.push(al === 0 ? 100 : 100 - 100 / (1 + ag / al)); }
    else { ag = (ag * (period - 1) + g) / period; al = (al * (period - 1) + l) / period; result.push(al === 0 ? 100 : 100 - 100 / (1 + ag / al)); }
  }
  return result;
}

// ── Signal engine ──────────────────────────────────────────────────────────
type Bar = { time: number; open: number; high: number; low: number; close: number; volume: number };

function runStrategy(strategyId: string, params: Record<string, number | boolean | string>, bars: Bar[]): "buy" | "sell" | "hold" {
  const closes = bars.map((b) => b.close);
  const n = bars.length;

  switch (strategyId) {
    case "ema-crossover": case "triple-ema": {
      const fp = Number(params.fastPeriod ?? 9), sp = Number(params.slowPeriod ?? 21);
      const mp = Number(params.midPeriod ?? 0);
      const fast = calcEMA(closes, fp), slow = calcEMA(closes, sp);
      if (mp) {
        const mid = calcEMA(closes, mp);
        const bullNow = fast[n-1]>mid[n-1]&&mid[n-1]>slow[n-1];
        const bullPrev = fast[n-2]>mid[n-2]&&mid[n-2]>slow[n-2];
        const bearNow = fast[n-1]<mid[n-1]&&mid[n-1]<slow[n-1];
        const bearPrev = fast[n-2]<mid[n-2]&&mid[n-2]<slow[n-2];
        if (bullNow && !bullPrev) return "buy";
        if (bearNow && !bearPrev) return "sell";
        return "hold";
      }
      if (fast[n-2]<=slow[n-2]&&fast[n-1]>slow[n-1]) return "buy";
      if (fast[n-2]>=slow[n-2]&&fast[n-1]<slow[n-1]) return "sell";
      return "hold";
    }
    case "sma-crossover": {
      const fp = Number(params.fastPeriod ?? 50), sp = Number(params.slowPeriod ?? 200);
      const fast = calcSMA(closes, fp), slow = calcSMA(closes, sp);
      const cf = fast[n-1], cs = slow[n-1], pf = fast[n-2], ps = slow[n-2];
      if (!cf||!cs||!pf||!ps) return "hold";
      if (pf<=ps&&cf>cs) return "buy";
      if (pf>=ps&&cf<cs) return "sell";
      return "hold";
    }
    case "rsi-mean-reversion": case "rsi2": {
      const period = strategyId === "rsi2" ? 2 : 14;
      const os = Number(params.oversold ?? (strategyId === "rsi2" ? 10 : 30));
      const ob = Number(params.overbought ?? (strategyId === "rsi2" ? 90 : 70));
      const rsi = calcRSI(closes, period);
      const r = rsi[n-1];
      if (r == null) return "hold";
      if (r < os) return "buy";
      if (r > ob) return "sell";
      return "hold";
    }
    case "macd-crossover": {
      const fp = Number(params.fastPeriod ?? 12), sp2 = Number(params.slowPeriod ?? 26), sig = Number(params.signalPeriod ?? 9);
      const fast = calcEMA(closes, fp), slow2 = calcEMA(closes, sp2);
      const macd = fast.map((v, i) => v - slow2[i]);
      const signal = calcEMA(macd, sig);
      if (macd[n-2]<=signal[n-2]&&macd[n-1]>signal[n-1]) return "buy";
      if (macd[n-2]>=signal[n-2]&&macd[n-1]<signal[n-1]) return "sell";
      return "hold";
    }
    case "bollinger-bands": {
      const period = Number(params.period ?? 20), mult = Number(params.stdDev ?? 2);
      const sma = calcSMA(closes, period);
      const upper = closes.map((_, i) => {
        if (i < period - 1) return null;
        const sl = closes.slice(i - period + 1, i + 1);
        const m = sma[i]!;
        const std = Math.sqrt(sl.reduce((s, v) => s + (v - m) ** 2, 0) / period);
        return m + mult * std;
      });
      const lower = closes.map((_, i) => {
        if (i < period - 1) return null;
        const sl = closes.slice(i - period + 1, i + 1);
        const m = sma[i]!;
        const std = Math.sqrt(sl.reduce((s, v) => s + (v - m) ** 2, 0) / period);
        return m - mult * std;
      });
      const cu = upper[n-1], cl = lower[n-1], pu = upper[n-2], pl = lower[n-2];
      if (!cu||!cl||!pu||!pl) return "hold";
      if (closes[n-2]>pl&&closes[n-1]<cl) return "buy";
      if (closes[n-2]<pu&&closes[n-1]>cu) return "sell";
      return "hold";
    }
    default:
      return "hold";
  }
}

// ── POST handler ───────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ success: false, error: "id required" }, { status: 400 });

  const db = supabase();
  const { data: lambda, error: lambdaErr } = await db.from("trading_lambdas").select("*").eq("id", id).single();
  if (lambdaErr || !lambda) return NextResponse.json({ success: false, error: "Lambda not found" }, { status: 404 });
  if (lambda.status !== "active") return NextResponse.json({ success: false, error: "Lambda is not active" }, { status: 400 });
  if (!lambda.tradier_api_key || !lambda.tradier_account_id) {
    return NextResponse.json({ success: false, error: "Tradier credentials not configured" }, { status: 400 });
  }

  try {
    const bars = await getHistoricalBars(lambda.tradier_api_key, lambda.is_sandbox, lambda.symbol, 250);
    if (bars.length < 30) return NextResponse.json({ success: false, error: "Not enough market data" }, { status: 400 });

    const signal = runStrategy(lambda.strategy_id, lambda.params, bars);
    const currentPrice = bars[bars.length - 1].close;

    const { data: openTrades } = await db.from("lambda_trades").select("*").eq("lambda_id", id).eq("status", "open").limit(1);
    const openTrade = openTrades?.[0] ?? null;

    const position = await getPosition(lambda.tradier_api_key, lambda.is_sandbox, lambda.tradier_account_id, lambda.symbol);
    const inPosition = !!(position && Number(position.quantity) > 0);

    let tradeAction = "none";
    let orderResult = null;

    if (signal === "buy" && !inPosition) {
      orderResult = await placeOrder(lambda.tradier_api_key, lambda.is_sandbox, lambda.tradier_account_id, lambda.symbol, "buy", lambda.position_size);
      await db.from("lambda_trades").insert({
        lambda_id: id, symbol: lambda.symbol, side: "LONG",
        entry_price: currentPrice, quantity: lambda.position_size,
        entry_time: new Date().toISOString(), status: "open",
      });
      tradeAction = "opened long";
    } else if (signal === "sell" && inPosition && openTrade) {
      const qty = Number(position.quantity);
      orderResult = await placeOrder(lambda.tradier_api_key, lambda.is_sandbox, lambda.tradier_account_id, lambda.symbol, "sell", qty);
      const pnl = (currentPrice - openTrade.entry_price) * qty;
      await db.from("lambda_trades").update({
        exit_price: currentPrice, exit_time: new Date().toISOString(),
        pnl, pnl_percent: (pnl / (openTrade.entry_price * qty)) * 100,
        status: "closed", exit_reason: "Strategy signal: sell",
        order_id: orderResult?.order?.id ? String(orderResult.order.id) : null,
        updated_at: new Date().toISOString(),
      }).eq("id", openTrade.id);
      tradeAction = "closed long";
    }

    // Update lambda last_run
    await db.from("trading_lambdas").update({ updated_at: new Date().toISOString() }).eq("id", id);

    return NextResponse.json({ success: true, signal, tradeAction, currentPrice, orderResult });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Execution failed" }, { status: 500 });
  }
}
