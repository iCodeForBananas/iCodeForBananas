import type { Metadata } from "next";
import LeaderboardPage from "./page-client";

export const metadata: Metadata = {
  title: "Trading Leaderboard",
  description: "Compare trading strategy performance. Rank by returns, drawdown, and risk-adjusted metrics.",
  keywords: ["trading leaderboard", "trading strategies", "returns", "drawdown", "risk metrics", "performance"],
  openGraph: {
    title: "Trading Leaderboard",
    description: "Compare trading strategy performance. Rank by returns, drawdown, and risk-adjusted metrics.",
    type: "website",
  },
};

export default LeaderboardPage;
