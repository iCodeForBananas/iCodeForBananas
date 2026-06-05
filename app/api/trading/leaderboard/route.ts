import { NextRequest, NextResponse } from "next/server";
import { supabaseAnon } from "../lib/executor";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const db = supabaseAnon();
  const { data: { user }, error: authError } = await db.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data: lambdas, error: lambdaError } = await db
      .from("trading_lambdas")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (lambdaError) throw lambdaError;

    const lambdaIds = (lambdas ?? []).map((l) => l.id);
    let trades: Record<string, unknown>[] = [];
    if (lambdaIds.length > 0) {
      const { data: tradeData, error: tradeError } = await db
        .from("lambda_trades")
        .select("*")
        .in("lambda_id", lambdaIds)
        .order("entry_time", { ascending: true });
      if (tradeError) throw tradeError;
      trades = tradeData ?? [];
    }

    // Aggregate stats per lambda
    const leaderboard = (lambdas ?? []).map((lambda) => {
      const lambdaTrades = trades.filter((t) => t.lambda_id === lambda.id);
      const closedTrades = lambdaTrades.filter((t) => t.status === "closed");
      const openTrade = lambdaTrades.find((t) => t.status === "open") ?? null;

      const totalPnl = closedTrades.reduce((sum, t) => sum + ((t.pnl as number) ?? 0), 0);
      const totalPnlPercent = (totalPnl / lambda.initial_capital) * 100;
      const wins = closedTrades.filter((t) => ((t.pnl as number) ?? 0) > 0);
      const losses = closedTrades.filter((t) => ((t.pnl as number) ?? 0) <= 0);
      const winRate = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;
      const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + ((t.pnl as number) ?? 0), 0) / wins.length : 0;
      const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + ((t.pnl as number) ?? 0), 0) / losses.length : 0;
      const profitFactor = Math.abs(avgLoss) > 0 ? Math.abs(avgWin * wins.length) / Math.abs(avgLoss * losses.length) : 0;

      let equity = lambda.initial_capital;
      const equityCurve = closedTrades.map((t) => {
        equity += (t.pnl as number) ?? 0;
        return { time: t.exit_time, equity };
      });

      let peak = lambda.initial_capital;
      let maxDrawdown = 0;
      let runningEquity = lambda.initial_capital;
      for (const t of closedTrades) {
        runningEquity += (t.pnl as number) ?? 0;
        if (runningEquity > peak) peak = runningEquity;
        const dd = peak - runningEquity;
        if (dd > maxDrawdown) maxDrawdown = dd;
      }

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

    leaderboard.sort((a, b) => b.stats.totalPnl - a.stats.totalPnl);

    return NextResponse.json({ success: true, leaderboard });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load leaderboard" },
      { status: 500 }
    );
  }
}
