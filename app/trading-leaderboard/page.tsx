import type { Metadata } from "next";
import type { DeploymentConfig } from "@/app/lib/deploymentDetails";
import TradingLeaderboardContent from "./TradingLeaderboardContent";

export const metadata: Metadata = {
  title: "Trading Leaderboard",
  description: "The live paper-trading strategies ranked by return, each indexed to $10,000.",
  openGraph: {
    title: "Trading Leaderboard",
    description: "The live paper-trading strategies ranked by return, each indexed to $10,000.",
    type: "website",
  },
};

// How each deployment is set to run, from public.strategy_deployments (the
// dispatcher's list), refreshed every few minutes. If it can't be read the
// page still renders, without the Schedule, Sizing and Limits lines.
export const revalidate = 300;

interface ConfigRow {
  id: string;
  enabled: boolean;
  enable_shorts: boolean;
  starting_equity: number;
  position_size_pct: number;
  max_daily_loss_pct: number;
  drawdown_limit_pct: number;
  drawdown_pause_bars: number;
  /** Missing until the 20261125 migration has run. */
  teardown_requested_at?: string | null;
}

async function loadConfigs(): Promise<DeploymentConfig[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return [];
  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/rpc/strategy_deployment_configs`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: "{}",
      next: { revalidate },
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as ConfigRow[];
    return rows.map((r) => ({
      id: r.id,
      enabled: r.enabled,
      enableShorts: r.enable_shorts,
      startingEquity: r.starting_equity,
      positionSizePct: r.position_size_pct,
      maxDailyLossPct: r.max_daily_loss_pct,
      drawdownLimitPct: r.drawdown_limit_pct,
      drawdownPauseBars: r.drawdown_pause_bars,
      tearingDown: r.teardown_requested_at != null,
    }));
  } catch {
    return [];
  }
}

export default async function TradingLeaderboardPage() {
  return <TradingLeaderboardContent deploymentConfigs={await loadConfigs()} />;
}
