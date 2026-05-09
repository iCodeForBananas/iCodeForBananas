"use client";

import { useState, useEffect, useCallback } from "react";
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";

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

interface LambdaStats {
  totalPnl: number;
  totalPnlPercent: number;
  totalTrades: number;
  winRate: number;
  wins: number;
  losses: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  equityCurve: { time: string; equity: number }[];
  lastTrade: Trade | null;
  openTrade: Trade | null;
}

interface Lambda {
  id: string;
  name: string;
  strategy_id: string;
  strategy_name: string;
  symbol: string;
  params: Record<string, unknown>;
  status: string;
  position_size: number;
  initial_capital: number;
  is_sandbox: boolean;
  created_at: string;
  stats: LambdaStats;
}

const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e",
  paused: "#f59e0b",
  stopped: "#ef4444",
};

const STATUS_BG: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  paused: "bg-amber-100 text-amber-700",
  stopped: "bg-red-100 text-red-700",
};

function fmt(n: number, decimals = 2): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtTime(s: string): string {
  return new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function PnlBadge({ value, percent }: { value: number; percent: number }) {
  const pos = value >= 0;
  return (
    <div className={`flex items-center gap-1 font-bold text-lg ${pos ? "text-green-600" : "text-red-500"}`}>
      <span>{pos ? "▲" : "▼"}</span>
      <span>${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      <span className="text-sm font-medium opacity-75">({pos ? "+" : ""}{fmt(percent)}%)</span>
    </div>
  );
}

function MiniChart({ data, positive }: { data: { time: string; equity: number }[]; positive: boolean }) {
  if (data.length < 2) {
    return <div className="h-16 flex items-center justify-center text-xs text-gray-400">No chart data yet</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={64}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
        <Line
          type="monotone"
          dataKey="equity"
          stroke={positive ? "#22c55e" : "#ef4444"}
          strokeWidth={2}
          dot={false}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as { time: string; equity: number };
            return (
              <div className="bg-gray-900 text-white text-xs px-2 py-1 rounded shadow">
                <div>${fmt(p.equity)}</div>
                <div className="text-gray-400">{fmtTime(p.time)}</div>
              </div>
            );
          }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function LambdaCard({ lambda, rank }: { lambda: Lambda; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  const { stats } = lambda;
  const positive = stats.totalPnl >= 0;

  return (
    <div className={`bg-white rounded-xl border-2 transition-all ${positive ? "border-green-100" : "border-red-100"} shadow-sm hover:shadow-md`}>
      {/* Header */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white ${rank === 1 ? "bg-yellow-400" : rank === 2 ? "bg-gray-400" : rank === 3 ? "bg-amber-600" : "bg-gray-300"}`}>
              {rank}
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-base leading-tight">{lambda.name}</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-gray-500">{lambda.strategy_name}</span>
                <span className="text-gray-300">·</span>
                <span className="text-xs font-medium text-gray-700">{lambda.symbol}</span>
                {lambda.is_sandbox && (
                  <>
                    <span className="text-gray-300">·</span>
                    <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">SANDBOX</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_BG[lambda.status] ?? "bg-gray-100 text-gray-600"}`}>
            {lambda.stats.openTrade ? "🔄 In trade" : lambda.status}
          </span>
        </div>

        {/* P&L */}
        <div className="mb-3">
          <PnlBadge value={stats.totalPnl} percent={stats.totalPnlPercent} />
        </div>

        {/* Mini chart */}
        <MiniChart data={stats.equityCurve} positive={positive} />

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-gray-100">
          <div className="text-center">
            <div className="text-xs text-gray-400 mb-0.5">Trades</div>
            <div className="text-sm font-bold text-gray-800">{stats.totalTrades}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-400 mb-0.5">Win Rate</div>
            <div className={`text-sm font-bold ${stats.winRate >= 50 ? "text-green-600" : "text-red-500"}`}>
              {stats.totalTrades > 0 ? `${fmt(stats.winRate, 0)}%` : "—"}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-400 mb-0.5">Profit Factor</div>
            <div className={`text-sm font-bold ${stats.profitFactor >= 1 ? "text-green-600" : "text-red-500"}`}>
              {stats.totalTrades > 0 ? fmt(stats.profitFactor) : "—"}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-400 mb-0.5">Max DD</div>
            <div className="text-sm font-bold text-red-500">
              {stats.totalTrades > 0 ? `${fmt(stats.maxDrawdownPercent, 1)}%` : "—"}
            </div>
          </div>
        </div>

        {/* Open trade */}
        {stats.openTrade && (
          <div className="mt-3 p-2.5 bg-blue-50 rounded-lg border border-blue-100">
            <div className="flex items-center justify-between text-xs">
              <span className="text-blue-700 font-medium">🔄 Open {stats.openTrade.side} @ ${fmt(stats.openTrade.entry_price)}</span>
              <span className="text-blue-500">{fmtTime(stats.openTrade.entry_time)}</span>
            </div>
          </div>
        )}

        {/* Last trade */}
        {stats.lastTrade && !stats.openTrade && (
          <div className="mt-2 text-xs text-gray-400">
            Last trade: {fmtTime(stats.lastTrade.exit_time ?? stats.lastTrade.entry_time)}
          </div>
        )}

        {/* Expand button */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full mt-3 text-xs text-gray-400 hover:text-gray-600 flex items-center justify-center gap-1"
        >
          {expanded ? "▲ Hide details" : "▼ Show details"}
        </button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-gray-100 p-5 bg-gray-50 rounded-b-xl">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <div className="text-xs text-gray-400 mb-1">Avg Win</div>
              <div className="text-sm font-medium text-green-600">+${fmt(stats.avgWin)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Avg Loss</div>
              <div className="text-sm font-medium text-red-500">${fmt(stats.avgLoss)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Position Size</div>
              <div className="text-sm font-medium">{lambda.position_size} shares</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Starting Capital</div>
              <div className="text-sm font-medium">${lambda.initial_capital.toLocaleString()}</div>
            </div>
          </div>

          <div className="text-xs text-gray-400 mb-2 font-medium">Strategy Parameters</div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(lambda.params).map(([k, v]) => (
              <span key={k} className="text-xs bg-white border border-gray-200 rounded px-2 py-1 font-mono">
                {k}={String(v)}
              </span>
            ))}
          </div>
          <div className="mt-3 text-xs text-gray-400">
            Deployed {fmtDate(lambda.created_at)}
          </div>
        </div>
      )}
    </div>
  );
}

function FullEquityChart({ lambdas }: { lambdas: Lambda[] }) {
  const colors = ["#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899"];
  const active = lambdas.filter((l) => l.stats.equityCurve.length >= 2);
  if (active.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 shadow-sm">
      <h2 className="font-bold text-gray-800 mb-4">All Strategies — Equity Curves</h2>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="time"
              type="category"
              allowDuplicatedCategory={false}
              tickFormatter={(v) => new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              fontSize={11}
            />
            <YAxis fontSize={11} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              formatter={(value: number | undefined) => [`$${fmt(value ?? 0)}`, ""]}
              labelFormatter={(v) => fmtTime(String(v))}
            />
            {active.map((lambda, i) => (
              <Line
                key={lambda.id}
                data={lambda.stats.equityCurve}
                type="monotone"
                dataKey="equity"
                name={lambda.name}
                stroke={colors[i % colors.length]}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function LeaderboardPage() {
  const [lambdas, setLambdas] = useState<Lambda[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/trading/leaderboard");
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setLambdas(data.leaderboard);
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000); // refresh every minute
    return () => clearInterval(interval);
  }, [load]);

  const totalPnl = lambdas.reduce((s, l) => s + l.stats.totalPnl, 0);
  const totalTrades = lambdas.reduce((s, l) => s + l.stats.totalTrades, 0);
  const activeLambdas = lambdas.filter((l) => l.status === "active").length;
  const avgWinRate = lambdas.length > 0
    ? lambdas.filter(l => l.stats.totalTrades > 0).reduce((s, l) => s + l.stats.winRate, 0) /
      (lambdas.filter(l => l.stats.totalTrades > 0).length || 1)
    : 0;

  return (
    <div className="flex flex-col flex-1 bg-gray-50">
      <main className="px-4 py-8 flex-1">
        <div className="w-full max-w-5xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">📈 Trading Leaderboard</h1>
                <p className="text-gray-500 mt-1">Live performance of all deployed algorithmic strategies</p>
              </div>
              <div className="flex items-center gap-3">
                {lastUpdated && (
                  <span className="text-xs text-gray-400">
                    Updated {lastUpdated.toLocaleTimeString()}
                  </span>
                )}
                <button
                  onClick={load}
                  disabled={loading}
                  className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-white text-gray-600 disabled:opacity-50"
                >
                  {loading ? "Loading…" : "↻ Refresh"}
                </button>
              </div>
            </div>

            {/* Summary stats */}
            {lambdas.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
                <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
                  <div className="text-xs text-gray-400 mb-1">Total P&L (all strategies)</div>
                  <div className={`text-xl font-bold ${totalPnl >= 0 ? "text-green-600" : "text-red-500"}`}>
                    {totalPnl >= 0 ? "+" : ""}${fmt(totalPnl)}
                  </div>
                </div>
                <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
                  <div className="text-xs text-gray-400 mb-1">Active Strategies</div>
                  <div className="text-xl font-bold text-gray-800">{activeLambdas}</div>
                </div>
                <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
                  <div className="text-xs text-gray-400 mb-1">Total Trades</div>
                  <div className="text-xl font-bold text-gray-800">{totalTrades}</div>
                </div>
                <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
                  <div className="text-xs text-gray-400 mb-1">Avg Win Rate</div>
                  <div className={`text-xl font-bold ${avgWinRate >= 50 ? "text-green-600" : "text-red-500"}`}>
                    {lambdas.some(l => l.stats.totalTrades > 0) ? `${fmt(avgWinRate, 0)}%` : "—"}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Loading */}
          {loading && lambdas.length === 0 && (
            <div className="text-center py-20 text-gray-400">Loading strategies…</div>
          )}

          {/* Combined equity chart */}
          {lambdas.length > 0 && <FullEquityChart lambdas={lambdas} />}

          {/* Empty state */}
          {!loading && lambdas.length === 0 && !error && (
            <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
              <div className="text-4xl mb-3">🚀</div>
              <h3 className="text-lg font-semibold text-gray-700 mb-2">No strategies deployed yet</h3>
              <p className="text-gray-400 text-sm max-w-sm mx-auto">
                Head to <a href="/algo-backtest" className="text-blue-500 underline">Algo Backtest</a>, find a strategy
                that performs well, then use <strong>Export Lambda</strong> to deploy it. Once running, its trades will
                appear here automatically.
              </p>
            </div>
          )}

          {/* Lambda cards grid */}
          {lambdas.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {lambdas.map((lambda, i) => (
                <LambdaCard key={lambda.id} lambda={lambda} rank={i + 1} />
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="mt-8 text-center text-xs text-gray-400">
            Data refreshes automatically every 60 seconds · Strategies use Tradier API ·{" "}
            <a href="/algo-backtest" className="underline hover:text-gray-600">Back to Backtest</a>
          </div>
        </div>
      </main>
    </div>
  );
}
