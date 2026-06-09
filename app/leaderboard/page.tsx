import type { Metadata } from "next";
import LeaderboardPage from "./page-client";

export const metadata: Metadata = {
  title: "Trading Leaderboard",
  description: "See how different trading strategies rank by performance. Compare returns, drawdown, and risk-adjusted metrics.",
  keywords: ["trading leaderboard", "algorithmic trading", "strategy performance", "returns", "drawdown", "risk metrics"],
  openGraph: {
    title: "Trading Leaderboard",
    description: "See how different trading strategies rank by performance. Compare returns, drawdown, and risk-adjusted metrics.",
    type: "website",
  },
};

export default LeaderboardPage;
