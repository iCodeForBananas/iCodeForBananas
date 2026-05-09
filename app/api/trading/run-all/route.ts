import { NextRequest, NextResponse } from "next/server";
import { supabaseService, executeStrategy, isDue, DeployedStrategy } from "../lib/executor";

export const dynamic = "force-dynamic";

// Called by Vercel cron on a schedule (see vercel.json).
// Also callable manually with the CRON_SECRET header for testing.
export async function GET(req: NextRequest) {
  // Verify the request is from Vercel cron or an authorised caller
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("Authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
  }

  const db = supabaseService();
  const { data: strategies, error } = await db
    .from("trading_lambdas")
    .select("*")
    .eq("status", "active");

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const results: { id: string; name: string; ran: boolean; result?: unknown; error?: string }[] = [];

  for (const strategy of (strategies ?? []) as DeployedStrategy[]) {
    if (!isDue(strategy)) {
      results.push({ id: strategy.id, name: strategy.name, ran: false });
      continue;
    }

    try {
      const result = await executeStrategy(strategy);
      results.push({ id: strategy.id, name: strategy.name, ran: true, result });
    } catch (e) {
      results.push({
        id: strategy.id,
        name: strategy.name,
        ran: true,
        error: e instanceof Error ? e.message : "unknown",
      });
    }
  }

  const ran = results.filter((r) => r.ran).length;
  const skipped = results.filter((r) => !r.ran).length;

  return NextResponse.json({
    success: true,
    summary: { total: results.length, ran, skipped },
    results,
  });
}
