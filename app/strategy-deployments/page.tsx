import type { Metadata } from "next";
import StrategyDeploymentsContent from "./StrategyDeploymentsContent";

export const metadata: Metadata = {
  title: "Deployed Strategies",
  description: "Strategies deployed from the algo backtester to Tradier paper trading.",
  robots: { index: false },
};

export default function StrategyDeploymentsPage() {
  return <StrategyDeploymentsContent />;
}
