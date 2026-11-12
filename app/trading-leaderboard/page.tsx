import type { Metadata } from "next";
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

export default function TradingLeaderboardPage() {
  return <TradingLeaderboardContent />;
}
