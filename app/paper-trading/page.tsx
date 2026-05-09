"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, ReferenceLine,
} from "recharts";

interface TradingLambda {
  id: string;
  name: string;
  strategy_id: string;
  strategy_name: string;
  symbol: string;
  params: Record<string, number | boolean | string>;
  status: "active" | "paused" | "stopped";
  position_size: number;
  initial_capital: number;
  is_sandbox: boolean;
  timeframe: string;
  last_run_at: string | null;
  created_at: string;
}

interface Trade {
  id: string;
  lambda_id: string;
  symbol: string;
  side: string;
  entry_price: number;
  exit_price: number | null;
  quantity: number;
  entry_time: string;
  exit_time: string | null;
  pnl: number | null;
  pnl_percent: number | null;
  status: string;
  exit_reason: string | null;
}

interface StrategyStats {
  totalPnl: number;
  totalPnlPct: number;
  totalTrades: number;
  openTrades: number;
  winRate: number;
  wins: number;
  losses: number;
  equityCurve: { date: string; equity: number }[];
}

function computeStats(lambda: TradingLambda, trades: Trade[]): StrategyStats {
  const closed = trades.filter((t) => t.status === "closed" && t.pnl != null);
  const open = trades.filter((t) => t.status === "open");
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0);
  const losses = closed.filter((t) => (t.pnl ?? 0) <= 0);
  const totalPnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const totalPnlPct = (totalPnl / lambda.initial_capital) * 100;
  const winRate = closed.length > 0 ? (wins.length / closed.length) * 100 : 0;

  const sorted = [...closed].sort(
    (a, b) => new Date(a.exit_time!).getTime() - new Date(b.exit_time!).getTime()
  );
  let equity = lambda.initial_capital;
  const equityCurve: { date: string; equity: number }[] = [
    { date: new Date(lambda.created_at).toLocaleDateString(), equity },
  ];
  for (const t of sorted) {
    equity += t.pnl ?? 0;
    equityCurve.push({
      date: new Date(t.exit_time!).toLocaleDateString(),
      equity: Math.round(equity * 100) / 100,
    });
  }

  return {
    totalPnl,
    totalPnlPct,
    totalTrades: closed.length,
    openTrades: open.length,
    winRate,
    wins: wins.length,
    losses: losses.length,
    equityCurve,
  };
}

const TIMEFRAME_LABELS: Record<string, string> = {
  "5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h", daily: "daily",
};

const TIMEFRAME_MS: Record<string, number> = {
  "5m": 5 * 60000,
  "15m": 15 * 60000,
  "1h": 60 * 60000,
  "4h": 4 * 60 * 60000,
  daily: 20 * 60 * 60000,
};

function nextRunLabel(lambda: TradingLambda): string {
  if (!lambda.last_run_at) return "pending";
  const interval = TIMEFRAME_MS[lambda.timeframe] ?? TIMEFRAME_MS.daily;
  const next = new Date(new Date(lambda.last_run_at).getTime() + interval);
  const diff = next.getTime() - Date.now();
  if (diff <= 0) return "due now";
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.round(diff / 3600000);
  return `in ${hrs}h`;
}

const STATUS_COLORS: Record<string, string> = {
  active: "text-green-400 bg-green-400/10",
  paused: "text-yellow-400 bg-yellow-400/10",
  stopped: "text-slate-400 bg-slate-700",
};

function MiniChart({
  data,
  isPositive,
}: {
  data: { date: string; equity: number }[];
  isPositive: boolean;
}) {
  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center h-full text-slate-600 text-xs">
        No trades yet
      </div>
    );
  }
  const color = isPositive ? "#4ade80" : "#f87171";
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="date" hide />
        <YAxis domain={["auto", "auto"]} hide />
        <ReferenceLine y={data[0]?.equity} stroke="#334155" strokeDasharray="3 3" />
        <Tooltip
          contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }}
          formatter={(v: number | undefined) => [`$${(v ?? 0).toLocaleString()}`, "Equity"]}
          labelStyle={{ color: "#94a3b8" }}
        />
        <Line type="monotone" dataKey="equity" stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

interface LambdaCardProps {
  lambda: TradingLambda;
  lambdaTrades: Trade[];
  stats: StrategyStats;
  isExpanded: boolean;
  executing: string | null;
  onRun: (id: string) => void;
  onToggle: (lambda: TradingLambda) => void;
  onExpand: (id: string | null) => void;
}

function LambdaCard({
  lambda,
  lambdaTrades,
  stats,
  isExpanded,
  executing,
  onRun,
  onToggle,
  onExpand,
}: LambdaCardProps) {
  const isPositive = stats.totalPnl >= 0;

  return (
    <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl overflow-hidden">
      {/* Top row */}
      <div className="flex items-start gap-4 p-4">
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-white text-sm">{lambda.name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_COLORS[lambda.status]}`}>
              {lambda.status}
            </span>
            {lambda.is_sandbox && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-semibold">paper</span>
            )}
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-400 font-mono">
              {TIMEFRAME_LABELS[lambda.timeframe] ?? lambda.timeframe}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-xs text-slate-500">{lambda.strategy_name}</span>
            <span className="text-xs text-slate-600">·</span>
            <span className="text-xs text-slate-500">{lambda.symbol}</span>
            <span className="text-xs text-slate-600">·</span>
            <span className="text-xs text-slate-500">{lambda.position_size} shares</span>
            <span className="text-xs text-slate-600">·</span>
            <span className="text-xs text-slate-500">
              next run: <span className="text-slate-400">{nextRunLabel(lambda)}</span>
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-5 shrink-0">
          <div className="text-right">
            <p className={`text-base font-black ${isPositive ? "text-green-400" : "text-red-400"}`}>
              {isPositive ? "+" : ""}${stats.totalPnl.toFixed(0)}
            </p>
            <p className={`text-xs ${isPositive ? "text-green-500" : "text-red-500"}`}>
              {isPositive ? "+" : ""}{stats.totalPnlPct.toFixed(2)}%
            </p>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold text-white">{stats.winRate.toFixed(0)}%</p>
            <p className="text-xs text-slate-500">Win rate</p>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold text-white">{stats.totalTrades}</p>
            <p className="text-xs text-slate-500">{stats.openTrades > 0 ? `${stats.openTrades} open` : "trades"}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onRun(lambda.id)}
            disabled={executing === lambda.id || lambda.status === "stopped"}
            className="px-3 py-1.5 text-xs font-semibold bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white rounded-lg transition-colors"
            title="Run now"
          >
            {executing === lambda.id ? "Running…" : "▶ Run"}
          </button>
          <button
            onClick={() => onToggle(lambda)}
            className="px-3 py-1.5 text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
          >
            {lambda.status === "active" ? "⏸ Pause" : "▶ Resume"}
          </button>
          <button
            onClick={() => onExpand(isExpanded ? null : lambda.id)}
            className="px-2 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            {isExpanded ? "▲" : "▼"}
          </button>
        </div>
      </div>

      {/* Equity chart */}
      <div className="px-4 pb-1 h-28">
        <MiniChart data={stats.equityCurve} isPositive={isPositive} />
      </div>

      {/* Last run info bar */}
      <div className="px-4 pb-2 flex items-center gap-3 text-xs text-slate-600">
        {lambda.last_run_at ? (
          <>
            <span>Last run: {new Date(lambda.last_run_at).toLocaleString()}</span>
          </>
        ) : (
          <span>Never run — click ▶ Run or wait for the scheduler</span>
        )}
      </div>

      {/* Expanded: trade list */}
      {isExpanded && (
        <div className="border-t border-slate-700/60 mx-0">
          <div className="p-4">
            {/* Params */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {Object.entries(lambda.params).map(([k, v]) => (
                <span key={k} className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded font-mono">
                  {k}={String(v)}
                </span>
              ))}
            </div>

            {lambdaTrades.length === 0 ? (
              <p className="text-slate-500 text-sm">No trades yet — click Run to execute the strategy now.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-700">
                      <th className="pb-2 text-left font-semibold">Side</th>
                      <th className="pb-2 text-right font-semibold">Entry</th>
                      <th className="pb-2 text-right font-semibold">Exit</th>
                      <th className="pb-2 text-right font-semibold">P&amp;L</th>
                      <th className="pb-2 text-right font-semibold">%</th>
                      <th className="pb-2 text-left font-semibold pl-3">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lambdaTrades.slice().reverse().map((t) => (
                      <tr key={t.id} className="border-b border-slate-700/40 hover:bg-slate-700/20">
                        <td className="py-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${t.status === "open" ? "bg-blue-500/20 text-blue-400" : t.side === "LONG" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                            {t.status === "open" ? "OPEN" : t.side}
                          </span>
                        </td>
                        <td className="py-1.5 text-right text-slate-300 font-mono">${t.entry_price.toFixed(2)}</td>
                        <td className="py-1.5 text-right text-slate-300 font-mono">
                          {t.exit_price ? `$${t.exit_price.toFixed(2)}` : "—"}
                        </td>
                        <td className={`py-1.5 text-right font-mono font-semibold ${t.pnl == null ? "text-slate-500" : t.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {t.pnl == null ? "—" : `${t.pnl >= 0 ? "+" : ""}$${t.pnl.toFixed(2)}`}
                        </td>
                        <td className={`py-1.5 text-right font-mono ${t.pnl_percent == null ? "text-slate-500" : t.pnl_percent >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {t.pnl_percent == null ? "—" : `${t.pnl_percent >= 0 ? "+" : ""}${t.pnl_percent.toFixed(2)}%`}
                        </td>
                        <td className="py-1.5 pl-3 text-slate-400 truncate max-w-[200px]">{t.exit_reason ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PaperTradingPage() {
  const [lambdas, setLambdas] = useState<TradingLambda[]>([]);
  const [trades, setTrades] = useState<Record<string, Trade[]>>({});
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);

  useEffect(() => {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    );
    sb.auth.getSession().then(({ data }) => {
      setAuthToken(data.session?.access_token ?? null);
    });
  }, []);

  const load = useCallback(async (token: string | null) => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [lRes, tRes] = await Promise.all([
        fetch("/api/trading/lambdas", { headers }),
        fetch("/api/trading/trades", { headers }),
      ]);
      const [lJson, tJson] = await Promise.all([lRes.json(), tRes.json()]);
      if (lJson.success) setLambdas(lJson.lambdas);
      if (tJson.success) {
        const grouped: Record<string, Trade[]> = {};
        for (const t of tJson.trades as Trade[]) {
          if (!grouped[t.lambda_id]) grouped[t.lambda_id] = [];
          grouped[t.lambda_id].push(t);
        }
        setTrades(grouped);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load(authToken);
  }, [load, authToken]);

  const handleRun = async (id: string) => {
    if (!authToken) return;
    setExecuting(id);
    try {
      const res = await fetch(`/api/trading/execute?id=${id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const json = await res.json();
      if (!json.success) alert("Run failed: " + json.error);
      else await load(authToken);
    } catch (e) {
      alert("Run error: " + (e instanceof Error ? e.message : "unknown"));
    }
    setExecuting(null);
  };

  const handleToggleStatus = async (lambda: TradingLambda) => {
    if (!authToken) return;
    const newStatus = lambda.status === "active" ? "paused" : "active";
    await fetch(`/api/trading/lambdas/${lambda.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ status: newStatus }),
    });
    setLambdas((prev) =>
      prev.map((l) =>
        l.id === lambda.id ? { ...l, status: newStatus as "active" | "paused" } : l
      )
    );
  };

  if (loading) {
    return (
      <div className="flex-1 min-h-screen p-4 sm:p-6 max-w-6xl mx-auto">
        <PageHeader />
        <div className="flex items-center justify-center h-64 text-slate-500">Loading strategies…</div>
      </div>
    );
  }

  if (!authToken) {
    return (
      <div className="flex-1 min-h-screen p-4 sm:p-6 max-w-6xl mx-auto">
        <PageHeader />
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
          <div className="text-5xl">🔒</div>
          <p className="text-slate-300 font-semibold">Sign in to view your strategies</p>
          <p className="text-slate-500 text-sm">Only authorized users can view and manage deployed strategies.</p>
        </div>
      </div>
    );
  }

  if (lambdas.length === 0) {
    return (
      <div className="flex-1 min-h-screen p-4 sm:p-6 max-w-6xl mx-auto">
        <PageHeader />
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
          <div className="text-5xl">🚀</div>
          <p className="text-slate-300 font-semibold">No strategies deployed yet</p>
          <p className="text-slate-500 text-sm max-w-xs">
            Run a backtest in Algo Backtest, hit Deploy Strategy when it passes the readiness check.
          </p>
          <a
            href="/algo-backtest"
            className="px-5 py-2.5 bg-yellow-400 hover:bg-yellow-300 text-black font-bold rounded-lg text-sm transition-colors"
          >
            Open Algo Backtest
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-screen p-4 sm:p-6 max-w-6xl mx-auto">
      <PageHeader />
      <div className="flex flex-col gap-4">
        {lambdas.map((lambda) => (
          <LambdaCard
            key={lambda.id}
            lambda={lambda}
            lambdaTrades={trades[lambda.id] ?? []}
            stats={computeStats(lambda, trades[lambda.id] ?? [])}
            isExpanded={expandedId === lambda.id}
            executing={executing}
            onRun={handleRun}
            onToggle={handleToggleStatus}
            onExpand={setExpandedId}
          />
        ))}
      </div>
    </div>
  );
}

function PageHeader() {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight">Running Strategies</h1>
        <p className="text-sm text-slate-400 mt-0.5">Deployed strategies executing automatically against Tradier</p>
      </div>
      <a
        href="/algo-backtest"
        className="px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-black text-sm font-bold rounded-lg transition-colors"
      >
        + Deploy Strategy
      </a>
    </div>
  );
}
