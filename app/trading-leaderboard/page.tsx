import type { Metadata } from "next";
import { DEPLOYMENTS } from "@/trading/deployments";
import { resolveDeployment } from "@/trading/runtime/config";
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

// Each deployment as the trading runtime resolves it, ids included, so the
// page and the Lambdas can't disagree about which entry a report came from.
// trading/runtime/config.ts uses node:crypto, so this stays on the server.
const configs: DeploymentConfig[] = DEPLOYMENTS.map(resolveDeployment).map((d) => ({
  id: d.id,
  enabled: d.enabled,
  enableShorts: d.enableShorts,
  startingEquity: d.startingEquity,
  positionSizePct: d.positionSizePct,
  maxDailyLossPct: d.maxDailyLossPct,
  drawdownLimitPct: d.drawdownLimitPct,
  drawdownPauseBars: d.drawdownPauseBars,
}));

export default function TradingLeaderboardPage() {
  return <TradingLeaderboardContent deploymentConfigs={configs} />;
}
