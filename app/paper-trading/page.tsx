import type { Metadata } from "next";
import PaperTradingPage from "./PaperTradingPage";

export const metadata: Metadata = {
  title: "Running Strategies",
  description: "Monitor and control deployed algorithmic trading strategies. View live P&L, win rates, equity curves, and trade logs for each strategy executing against Tradier.",
  keywords: ["paper trading", "algorithmic trading", "trading strategies", "live trading", "P&L", "equity curve", "Tradier", "strategy dashboard"],
  openGraph: {
    title: "Running Strategies",
    description: "Monitor deployed algorithmic strategies — P&L, win rates, and equity curves.",
    type: "website",
  },
};

export default PaperTradingPage;
