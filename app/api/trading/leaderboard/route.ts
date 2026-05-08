import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    );

    // Fetch all lambdas
    const { data: lambdas, error: lambdaError } = await supabase
      .from("trading_lambdas")
      .select("*")
      .order("created_at", { ascending: false });

    if (lambdaError) throw lambdaError;

    // Fetch all trades
    const { data: trades, error: tradeError } = await supabase
      .from("lambda_trades")
      .select("*")
      .order("entry_time", { ascending: true });

    if (tradeError) throw tradeError;

    // Aggregate stats per lambda
    const leaderboard = (lambdas ?? []).map((lambda) => {
      const lambdaTrades = (trades ?? []).filter((t) => t.lambda_id === lambda.id);
      const closedTrades = lambdaTrades.filter((t) => t.status === "closed");
      const openTrade = lambdaTrades.find((t) => t.status === "open") ?? null;

      const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
      const totalPnlPercent = (totalPnl / lambda.initial_capital) * 100;
      const wins = closedTrades.filter((t) => (t.pnl ?? 0) > 0);
      const losses = closedTrades.filter((t) => (t.pnl ?? 0) <= 0);
      const winRate = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;
      const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + (t.pnl ?? 0), 0) / wins.length : 0;
      const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + (t.pnl ?? 0), 0) / losses.length : 0;
      const profitFactor = Math.abs(avgLoss) > 0 ? Math.abs(avgWin * wins.length) / Math.abs(avgLoss * losses.length) : 0;

      // Build equity curve
      let equity = lambda.initial_capital;
      const equityCurve = closedTrades.map((t) => {
        equity += t.pnl ?? 0;
        return { time: t.exit_time, equity };
      });

      // Max drawdown
      let peak = lambda.initial_capital;
      let maxDrawdown = 0;
      let runningEquity = lambda.initial_capital;
      for (const t of closedTrades) {
        runningEquity += t.pnl ?? 0;
        if (runningEquity > peak) peak = runningEquity;
        const dd = peak - runningEquity;
        if (dd > maxDrawdown) maxDrawdown = dd;
      }

      // Last activity
      const lastTrade = closedTrades[closedTrades.length - 1] ?? null;

      return {
        ...lambda,
        stats: {
          totalPnl,
          totalPnlPercent,
          totalTrades: closedTrades.length,
          winRate,
          wins: wins.length,
          losses: losses.length,
          avgWin,
          avgLoss,
          profitFactor,
          maxDrawdown,
          maxDrawdownPercent: peak > 0 ? (maxDrawdown / peak) * 100 : 0,
          equityCurve,
          lastTrade,
          openTrade,
        },
      };
    });

    // Sort by total P&L descending
    leaderboard.sort((a, b) => b.stats.totalPnl - a.stats.totalPnl);

    return NextResponse.json({ success: true, leaderboard });
  } catch (error) {
    console.error("Leaderboard error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load leaderboard" },
      { status: 500 }
    );
  }
}
